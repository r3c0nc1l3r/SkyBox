/**
 * Ortus Documentation Search — Pi Extension
 *
 * Three-tier architecture:
 * 0. Skills FTS index — offline search over 3 bundled skill repos (~150+ skills)
 * 1. MCP proxy tools — fast, stateless doc search via GitBook MCP endpoints
 * 2. Ortus Scholar subagent — cheap model builds opinionated context pack
 *
 * Search flow: Skills index first (fast, offline) → MCP fallback (network, cached)
 */

import { copyFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import * as os from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

import { PRODUCTS, findProduct, isKnownOrtusUrl, validProductNames } from "./sources.ts";
import { searchProduct, getPage, mcpCache } from "./mcp-client.ts";
import { ensureSkills, refreshSkills, discoverSkillFiles } from "./skills-repo.ts";
import { SkillsIndex, type SkillResult } from "./skills-index.ts";

const EXT_DIR = dirname(fileURLToPath(import.meta.url));

const MAX_CONCURRENCY = 4;
const MCP_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_PAGE_MAX_LENGTH = 8_000;
const SCHOLAR_READ_DEPTH = 3;
const SKILLS_MATCH_THRESHOLD = 0.3; // Minimum score to consider a skills match relevant

// Global skills index — built once on first access
const skillsIndex = new SkillsIndex();

/** Build or rebuild the skills index (non-fatal) */
function rebuildSkillsIndex(): { ok: boolean; count: number } {
	try {
		ensureSkills(); // clone if needed
		skillsIndex.build();
		return { ok: true, count: skillsIndex.size };
	} catch {
		return { ok: false, count: 0 };
	}
}

export default function (pi: ExtensionAPI) {
	// ── Tool 1: search_ortus_docs ──────────────────────────────────────

	pi.registerTool({
		name: "search_ortus_docs",
		label: "Search Ortus Docs",
		description: [
			"Search Ortus Solutions documentation and AI skills (BoxLang, ColdBox, CommandBox,",
			"WireBox, etc.) for a query. Searches the local skills index first for fast offline",
			"results, then falls back to MCP documentation endpoints if needed.",
			"Optionally filter to one product. Returns matching pages with URLs and excerpts.",
		].join(" "),
		parameters: Type.Object({
			query: Type.String({ description: "Search query (e.g. 'dependency injection', 'scheduled tasks')" }),
			product: Type.Optional(
				StringEnum(
					["", "boxlang", "coldbox", "commandbox", "wirebox", "testbox", "cachebox", "logbox", "quick", "qb", "contentbox", "docbox"] as const,
					{
						description: "Filter to one product. Omit to search all products.",
						default: "",
					},
				),
			),
			maxResults: Type.Optional(
				Type.Number({ description: "Max results per product", default: DEFAULT_MAX_RESULTS }),
			),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			const query = params.query.trim();
			if (!query) {
				return {
					content: [{ type: "text" as const, text: "Please provide a non-empty search query." }],
				};
			}

			const maxResults = params.maxResults ?? DEFAULT_MAX_RESULTS;

			// ── Phase 0: Search skills index (offline, fast) ──────────
			const skillResults = skillsIndex.isReady
				? skillsIndex.search(query, maxResults)
				: [];

			// If skills found strong matches, return those first
			const strongSkillHits = skillResults.filter((r) => r.score >= SKILLS_MATCH_THRESHOLD);

			// ── Phase 1: MCP documentation search (if needed) ─────────
			const productsToSearch = params.product
				? [findProduct(params.product)].filter(Boolean)
				: PRODUCTS;

			if (productsToSearch.length === 0) {
				// No MCP targets, but we may have skills
				if (strongSkillHits.length > 0) {
					return {
						content: [
							{
								type: "text" as const,
								text: formatSkillsResponse(query, skillResults, []) + "\n\n_(MCP search skipped — no valid product)_",
							},
						],
					};
				}
				return {
					content: [
						{
							type: "text" as const,
							text: `Unknown product "${params.product}". Valid products: ${validProductNames()}.`,
						},
					],
				};
			}

			const combinedSignal = makeAbortSignal(signal, MCP_TIMEOUT_MS);

			// Only do MCP search if skills didn't have a strong answer
			// OR if we want to augment (always do MCP for completeness)
			let mcpResults: { product: typeof PRODUCTS[0]; text: string; error: string | null }[] = [];

			try {
				mcpResults = await mapWithConcurrency(
					productsToSearch,
					MAX_CONCURRENCY,
					async (product) => {
						try {
							const text = await searchProduct(product, query, combinedSignal);
							return { product, text, error: null };
						} catch (err: any) {
							return { product, text: "", error: err.message };
						}
					},
				);
			} catch (err: any) {
				// MCP failed — return skills results if we have them
				if (skillResults.length > 0) {
					return {
						content: [
							{
								type: "text" as const,
								text: formatSkillsResponse(query, skillResults, [])
									+ "\n\n---\n⚠️ MCP search failed, showing skills-only results.",
							},
						],
					};
				}
				throw new Error(`MCP search error: ${err.message}`);
			}

			// Format combined results
			const mcpParts: string[] = [];
			let mcpHasResults = false;

			for (const r of mcpResults) {
				if (r.error) {
					mcpParts.push(`## ${r.product.label}\n⚠️ ${r.error}`);
					continue;
				}
				if (!r.text.trim()) {
					mcpParts.push(`## ${r.product.label}\n_No results._`);
					continue;
				}
				mcpParts.push(formatSearchResult(r.product.label, r.text, maxResults));
				mcpHasResults = true;
			}

			// Build response
			const parts: string[] = [];
			const header =
				params.product
					? `# Search: "${query}" in ${productsToSearch[0].label}\n\n`
					: `# Search: "${query}" across ${productsToSearch.length} products\n\n`;

			// Skills section
			if (strongSkillHits.length > 0) {
				const prefix = strongSkillHits.length >= maxResults
					? "**Source: Local skills index** (offline, no MCP call needed)"
					: "**Source: Local skills index** (augmented with MCP results below)";
				parts.push(formatSkillsResponse(query, skillResults, []).replace(/^# /, `## `) + `\n\n_${prefix}_`);
			}

			// MCP section
			if (mcpHasResults) {
				const mcpBody = mcpParts.join("\n\n---\n\n");
				if (strongSkillHits.length > 0) {
					parts.push("## Documentation Search Results\n" + mcpBody);
				} else if (!mcpHasResults && !strongSkillHits.length) {
					return {
						content: [{ type: "text" as const, text: `No results found for "${query}" across ${productsToSearch.length} product(s).` }],
					};
				} else {
					parts.push(mcpBody);
				}
			}

			if (parts.length === 0) {
				return {
					content: [{ type: "text" as const, text: `No results found for "${query}" in skills or documentation.` }],
				};
			}

			return {
				content: [{ type: "text" as const, text: header + parts.join("\n\n---\n\n") }],
			};
		},
	});

	// ── Tool 2: read_ortus_doc ─────────────────────────────────────────

	pi.registerTool({
		name: "read_ortus_doc",
		label: "Read Ortus Doc",
		description: [
			"Fetch the full markdown content of a specific Ortus documentation page.",
			"Use the URL from search_ortus_docs results.",
		].join(" "),
		parameters: Type.Object({
			url: Type.String({ description: "Full page URL from search_ortus_docs results" }),
			maxLength: Type.Optional(
				Type.Number({ description: "Max content length", default: DEFAULT_PAGE_MAX_LENGTH }),
			),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			const url = params.url.trim();

			// Validate URL belongs to a known Ortus product
			if (!isKnownOrtusUrl(url)) {
				return {
					content: [
						{
							type: "text" as const,
							text: [
								`URL "${url}" is not a known Ortus documentation domain.`,
								`Valid domains: ortusbooks.com subdomains for ${validProductNames()}.`,
								"Use search_ortus_docs to find valid documentation pages.",
							].join("\n"),
						},
					],
				};
			}

			// Find which product this URL belongs to
			const product = PRODUCTS.find((p) => {
				const host = new URL(p.mcpUrl).host;
				return url.includes(host);
			});

			if (!product) {
				return {
					content: [{ type: "text" as const, text: `Could not determine product for URL: ${url}` }],
				};
			}

			const maxLength = params.maxLength ?? DEFAULT_PAGE_MAX_LENGTH;
			const combinedSignal = makeAbortSignal(signal, MCP_TIMEOUT_MS);

			try {
				const text = await getPage(product, url, combinedSignal);

				if (text.length > maxLength) {
					return {
						content: [
							{
								type: "text" as const,
								text: text.slice(0, maxLength) + `\n\n[...content truncated at ${maxLength} bytes]`,
							},
						],
					};
				}

				return {
					content: [{ type: "text" as const, text }],
				};
			} catch (err: any) {
				throw new Error(`Error reading Ortus doc page: ${err.message}`);
			}
		},
	});

	// ── Tool 3: ortus_scholar — deep context builder ────────────────────

	pi.registerTool({
		name: "ortus_scholar",
		label: "Ortus Scholar",
		description: [
			"Deep-dive Ortus ecosystem context builder. Searches all relevant product docs,",
			"reads full pages, and returns a structured opinionated context pack covering",
			"the BoxLang, ColdBox, CFML ecosystem for a given task.",
		].join(" "),
		parameters: Type.Object({
			task: Type.String({
				description: "What to research or build context for (e.g. 'porting BXAI RAG to MXAI')",
			}),
			products: Type.Optional(
				Type.Array(
					StringEnum(["boxlang", "coldbox", "commandbox", "wirebox", "testbox", "cachebox", "logbox", "quick", "qb"] as const),
					{ description: "Products to focus on (default: all core)" },
				),
			),
			depth: Type.Optional(
				StringEnum(["quick", "thorough"] as const, { description: "Research depth", default: "quick" }),
			),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			const task = params.task.trim();
			if (!task) {
				return { content: [{ type: "text" as const, text: "Please provide a non-empty task." }] };
			}

			// Determine which products to search
			const productsToSearch = params.products?.length
				? params.products.map((n) => findProduct(n)).filter(Boolean)
				: PRODUCTS.filter((p) => p.priority === "core");

			if (productsToSearch.length === 0) {
				return {
					content: [{ type: "text" as const, text: "No valid products specified." }],
				};
			}

			const isThorough = params.depth === "thorough";
			const combinedSignal = makeAbortSignal(signal, MCP_TIMEOUT_MS * (isThorough ? 3 : 2));

			const sections: string[] = [];

			try {
				// ── Phase 0: Skills context ──────────────────────────
				if (skillsIndex.isReady) {
					const skillHits = skillsIndex.search(task, 3);
					if (skillHits.length > 0) {
						const skillLines: string[] = ["## Relevant AI Skills\n"];
						for (const sh of skillHits) {
							skillLines.push(`- **${sh.title}** (${sh.repo}) — relevance: ${(sh.score * 100).toFixed(0)}%`);
							skillLines.push(`  \`${sh.snippet}\``);
						}
						sections.push(skillLines.join("\n"));
					}
				}

				// ── Phase 1: Search all products ─────────────────────
				const searchResults = await mapWithConcurrency(
					productsToSearch,
					MAX_CONCURRENCY,
					async (product) => {
						try {
							const text = await searchProduct(product, task, combinedSignal);
							return { product, text, error: null };
						} catch (err: any) {
							return { product, text: "", error: err.message };
						}
					},
				);

				// ── Phase 2: Read top pages ─────────────────────────
				const readCount = isThorough ? SCHOLAR_READ_DEPTH : 1;
				const pagesToRead: { product: typeof PRODUCTS[0]; url: string }[] = [];

				for (const r of searchResults) {
					if (r.error || !r.text.trim()) continue;
					const urls = extractUrls(r.text);
					for (const url of urls.slice(0, readCount)) {
						pagesToRead.push({ product: r.product, url });
					}
				}

				const pageContents = await mapWithConcurrency(
					pagesToRead.slice(0, isThorough ? 9 : 3),
					MAX_CONCURRENCY,
					async ({ product, url }) => {
						try {
							const text = await getPage(product, url, combinedSignal);
							return { product, url, text, error: null };
						} catch (err: any) {
							return { product, url, text: "", error: err.message };
						}
					},
				);

				// ── Phase 3: Assemble context pack ──────────────────

				// Ecosystem Map
				const ecoLines: string[] = ["## Ecosystem Map\n"];
				ecoLines.push(`Research task: **${task}**`);
				ecoLines.push(`Products searched: ${productsToSearch.map((p) => p.label).join(", ")}`);
				ecoLines.push("");
				ecoLines.push("| Product | Role | Status |");
				ecoLines.push("|---------|------|--------|");
				for (const r of searchResults) {
					const status = r.error ? `⚠️ Error: ${r.error}` : r.text.trim() ? "✅ Found" : "🔍 No results";
					const role = getProductRole(r.product.name);
					ecoLines.push(`| ${r.product.label} | ${role} | ${status} |`);
				}
				sections.push(ecoLines.join("\n"));

				// Key Documentation
				const docLines: string[] = ["## Key Documentation\n"];
				let docCount = 0;
				for (const r of searchResults) {
					if (!r.text.trim() || r.error) continue;
					docLines.push(`### ${r.product.label}`);
					const urls = extractUrls(r.text);
					for (const url of urls.slice(0, 3)) {
						docCount++;
						docLines.push(`- [Page ${docCount}](${url})`);
					}
					// Include first content snippet
					const snippet = r.text.split("\n").slice(0, 8).join("\n");
					docLines.push("```\n" + snippet.substring(0, 500) + "\n```");
					docLines.push("");
				}
				sections.push(docLines.join("\n"));

				// Full Pages Read
				const pageLines: string[] = ["## Full Pages Retrieved\n"];
				for (const p of pageContents) {
					if (p.error) {
						pageLines.push(`- ⚠️ ${p.product.label}: ${p.error}`);
					} else if (p.text.trim()) {
						pageLines.push(`- ✅ ${p.product.label} — [${extractTitle(p.text) || "Page"}](${p.url})`);
						pageLines.push("  ```");
						pageLines.push(p.text.substring(0, 1500).replace(/\n/g, "\n  "));
						pageLines.push("  ```");
					}
				}
				sections.push(pageLines.join("\n"));

				// Architecture & Guidance (added at the end)
				const archLines: string[] = [
					"## Architecture Patterns & Guidance\n",
					"Based on the documentation retrieved above, here are the key patterns and conventions:\n",
					"### Confidence Legend",
					"- 🔵 **High**: Directly from product docs (cited above)",
					"- 🟡 **Medium**: Inferred from ecosystem patterns",
					"- ⚪ **Low**: Best guess — verify before acting\n",
					"*Review the Full Pages Retrieved section above for authoritative details.*",
				];
				sections.push(archLines.join("\n"));

				const header = `# Ortus Scholar Context Pack\n\n`;
				const body = sections.join("\n\n---\n\n");

				return {
					content: [{ type: "text" as const, text: (header + body).substring(0, 50_000) }],
				};
			} catch (err: any) {
				throw new Error(`Ortus Scholar error: ${err.message}`);
			}
		},
	});

	// ── Resources discovery (for prompts) ───────────────────────────────

	pi.on("resources_discover", () => {
		return {
			promptPaths: [join(EXT_DIR, "prompts")],
		};
	});

	// ── Command: /ortusbooks-pi:update-skills ───────────────────────────

	pi.registerCommand("ortusbooks-pi:update-skills", {
		description: "Pull latest skills from Ortus repos and rebuild the search index",
		handler: async (_args, ctx) => {
			ctx.ui.notify("Updating skills repos...", "info");
			const pullResults = refreshSkills();
			const cloned = ensureSkills();

			const lines: string[] = ["## Skills Update Results\n"];
			for (const r of pullResults) {
				lines.push(`| ${r.name} | ${r.ok ? "✅ Updated" : `⚠️ ${r.error}`} |`);
			}
			if (cloned > 0) {
				lines.push(`\n_(Cloned ${cloned} new repos)_`);
			}

			// Rebuild index
			const result = rebuildSkillsIndex();
			if (result.ok) {
				lines.push(`\nIndex rebuilt: **${result.count}** skill files indexed.`);
			} else {
				lines.push("\n⚠️ Index rebuild failed — extension uses MCP-only mode.");
			}

			ctx.ui.notify(lines.join("\n"), "info");
			return lines.join("\n");
		},
	});

	// ── Command: /ortusbooks-pi:refresh ─────────────────────────────────

	pi.registerCommand("ortusbooks-pi:refresh", {
		description: "Re-discover Ortus doc resources (agents, prompts)",
		handler: async (_args, ctx) => {
			ctx.ui.notify("Ortus Docs resources refreshed", "info");
		},
	});

	// ── Startup: install bundled agents, init skills, notify ───────────

	pi.on("session_start", async (_event, ctx) => {
		// Install bundled agents for pi-subagents discovery
		const bundledAgentsDir = join(EXT_DIR, "agents");
		const userAgentsDir = join(os.homedir(), ".pi", "agent", "agents");

		try {
			if (!existsSync(userAgentsDir)) {
				mkdirSync(userAgentsDir, { recursive: true });
			}
			const agentFiles = readdirSync(bundledAgentsDir).filter((f) => f.endsWith(".md"));
			for (const file of agentFiles) {
				const dest = join(userAgentsDir, file);
				// Don't overwrite user modifications
				if (!existsSync(dest)) {
					copyFileSync(join(bundledAgentsDir, file), dest);
				}
			}
		} catch {
			// Non-fatal — agents just won't be auto-discovered
		}

		// Init skills: clone repos + build index (best-effort, async-ish)
		let skillsNote = "skills: none";
		try {
			const cloned = ensureSkills();
			if (cloned > 0 || discoverSkillFiles().length > 0) {
				skillsIndex.build();
				if (skillsIndex.isReady && skillsIndex.size > 0) {
					skillsNote = `skills: ${skillsIndex.size} files indexed from ${3} repos`;
				}
			}
		} catch {
			skillsNote = "skills: failed to initialize";
		}

		ctx.ui.notify(
			`Ortus Docs: ${PRODUCTS.length} products, ${skillsNote}, ortus-scout + ortus-scholar agents`,
			"info",
		);
	});
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Format skills search results for LLM consumption. */
function formatSkillsResponse(query: string, results: SkillResult[], mcpInfo?: string[]): string {
	if (results.length === 0) return "";

	const parts: string[] = [`# Skills: "${query}"\n`];

	for (const r of results) {
		const bar = "━".repeat(Math.round(r.score * 20));
		const percent = (r.score * 100).toFixed(0);
		parts.push(`## ${r.title}`);
		parts.push(`- **Repo:** ${r.repo}`);
		parts.push(`- **File:** \`${r.relativePath}\` (score: ${percent}% ${bar})`);
		parts.push(`> ${r.snippet}`);
		parts.push("");
	}

	if (mcpInfo && mcpInfo.length > 0) {
		parts.push("### MCP Fallback Results");
		parts.push(...mcpInfo);
	}

	return parts.join("\n");
}

/** Extract URLs from MCP searchDocumentation response text. */
function extractUrls(text: string): string[] {
	const urls: string[] = [];
	for (const line of text.split("\n")) {
		const m = line.match(/^Link:\s*(https?:\/\/[^\s]+)/);
		if (m) urls.push(m[1].trim());
	}
	return urls;
}

/** Extract the first title from MCP response text. */
function extractTitle(text: string): string | null {
	for (const line of text.split("\n")) {
		const m = line.match(/^Title:\s*(.+)/);
		if (m) return m[1].trim();
	}
	return null;
}

/** Get a human-readable role for a product. */
function getProductRole(name: string): string {
	const roles: Record<string, string> = {
		boxlang: "Core language runtime",
		coldbox: "HMVC web framework",
		commandbox: "CLI + package manager + server",
		wirebox: "Dependency injection + AOP",
		testbox: "BDD/TDD testing framework",
		cachebox: "Enterprise caching",
		logbox: "Logging library",
		quick: "Active-record ORM",
		qb: "Fluent query builder",
		contentbox: "Modular CMS",
		docbox: "API documentation generator",
	};
	return roles[name] || "Ortus product";
}

/** Format a single product's search result for LLM consumption. */
function formatSearchResult(label: string, text: string, maxResults: number): string {
	const lines = text.split("\n");
	const parts: string[] = [`## ${label}`];

	// Find the first "Title:" line if present
	let resultCount = 0;
	let currentSection = "";

	for (const line of lines) {
		if (resultCount >= maxResults) {
			parts.push("_(more results available — use a more specific query)_");
			break;
		}

		if (line.startsWith("Title:")) {
			if (currentSection) parts.push(currentSection.trimEnd());
			currentSection = line + "\n";
			resultCount++;
		} else if (line.startsWith("Link:") || line.startsWith("Content:")) {
			currentSection += line + "\n";
		} else if (currentSection && line.trim()) {
			currentSection += line + "\n";
		}
	}

	if (currentSection) parts.push(currentSection.trimEnd());

	return parts.join("\n");
}

/**
 * Run an async function over an array with a concurrency limit.
 * Returns results in input order.
 */
async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	if (items.length === 0) return [];
	const limit = Math.max(1, Math.min(concurrency, items.length));
	const results: R[] = new Array(items.length);
	let nextIndex = 0;

	const workers = new Array(limit).fill(null).map(async () => {
		while (true) {
			const current = nextIndex++;
			if (current >= items.length) return;
			results[current] = await fn(items[current]);
		}
	});

	await Promise.all(workers);
	return results;
}

/**
 * Create a combined AbortSignal from an optional parent signal and a timeout.
 * Uses AbortSignal.any() (Node.js 20+) for proper cleanup.
 */
function makeAbortSignal(parentSignal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
	const timeout = AbortSignal.timeout(timeoutMs);
	if (!parentSignal) return timeout;
	if (typeof AbortSignal.any === "function") {
		return AbortSignal.any([parentSignal, timeout]);
	}
	// Fallback for older runtimes
	const controller = new AbortController();
	const onAbort = () => controller.abort();
	parentSignal.addEventListener("abort", onAbort, { once: true });
	timeout.addEventListener("abort", onAbort, { once: true });
	return controller.signal;
}
