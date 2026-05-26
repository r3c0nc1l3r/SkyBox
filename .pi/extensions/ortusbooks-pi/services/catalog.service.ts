/**
 * Catalog service — dynamic ecosystem entity discovery.
 *
 * Scans all 3 skill repos at call time and extracts frontmatter from every
 * SKILL.md file to build a living catalog of the Ortus ecosystem. No
 * hardcoded entity lists — driven entirely by the repo contents.
 *
 * Also merges in the product sources from sources.ts so the LLM knows
 * which products have live documentation MCP endpoints.
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { discoverSkillFiles, repoForPath, skillsCacheDir } from "../skills-repo.ts";
import { PRODUCTS } from "../sources.ts";
import type { CatalogEntry, ICatalogService } from "../core/types.ts";

// ── Simple YAML frontmatter parser ───────────────────────────────────

interface Frontmatter {
	name?: string;
	description?: string;
	applyTo?: string;
	[key: string]: unknown;
}

/**
 * Parse the `---` delimited YAML frontmatter from a markdown file.
 * Handles folded block scalars (`>`) and plain string values.
 * Purpose-built for SKILL.md format — not a general YAML parser.
 */
function parseFrontmatter(content: string): Frontmatter {
	const result: Frontmatter = {};
	const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
	if (!fmMatch) return result;

	const body = fmMatch[1];
	const lines = body.split("\n");

	let currentKey: string | null = null;
	let foldedBuffer: string[] = [];
	let inFolded = false;

	for (const raw of lines) {
		const line = raw.trimEnd();

		// Continuation of a folded block scalar (>)
		if (inFolded) {
			if (line.startsWith("  ")) {
				foldedBuffer.push(line.trim());
				continue;
			}
			// End of folded block
			if (currentKey) {
				result[currentKey] = foldedBuffer.join(" ");
			}
			foldedBuffer = [];
			inFolded = false;
			currentKey = null;
		}

		if (!line) continue;

		// Folded block scalar start: key: >
		const foldedMatch = line.match(/^(\w+):\s*>\s*$/);
		if (foldedMatch) {
			currentKey = foldedMatch[1];
			foldedBuffer = [];
			inFolded = true;
			continue;
		}

		// Plain key: value
		const kvMatch = line.match(/^(\w+):\s*(.*)$/);
		if (kvMatch) {
			const key = kvMatch[1];
			let value = kvMatch[2].trim();

			// Strip surrounding quotes
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}

			result[key] = value;
			currentKey = null;
		}
	}

	// Flush any remaining folded buffer
	if (inFolded && currentKey) {
		result[currentKey] = foldedBuffer.join(" ");
	}

	return result;
}

// ── Category assignment ──────────────────────────────────────────────

/**
 * Derive the category for a skill file based on its relative path
 * within the skills cache directory.
 */
function deriveCategory(relativePath: string): CatalogEntry["category"] {
	// coldbox-skills/modules/*/ → module
	if (/^coldbox-skills\/modules\/[^/]+\//.test(relativePath)) return "module";

	// ortus-boxlang-skills/boxlang-modules/*/ → module
	if (/^ortus-boxlang-skills\/boxlang-modules\/[^/]+\//.test(relativePath))
		return "module";

	// coldbox-skills/coldbox/*/ → concept
	if (/^coldbox-skills\/coldbox\/[^/]+\//.test(relativePath)) return "concept";

	// ortus-boxlang-skills/boxlang-developer/*/ → concept
	if (/^ortus-boxlang-skills\/boxlang-developer\/[^/]+\//.test(relativePath))
		return "concept";

	// ortus-boxlang-skills/boxlang-core-development/*/ → concept
	if (/^ortus-boxlang-skills\/boxlang-core-development\/[^/]+\//.test(relativePath))
		return "concept";

	// ortus-boxlang-skills/boxlang-modules/README.md → product (bx-ai umbrella)
	return "general";
}

// ── Catalog service ──────────────────────────────────────────────────

export class CatalogService implements ICatalogService {
	private entries: CatalogEntry[] | null = null;

	build(): CatalogEntry[] {
		if (this.entries) return this.entries;

		const entries = new Map<string, CatalogEntry>();

		// ── Phase 1: Scan skill repos ────────────────────────────────
		const mdFiles = discoverSkillFiles();
		const cacheRoot = skillsCacheDir();

		for (const filePath of mdFiles) {
			// Only process SKILL.md files (skip README.md, etc.)
			if (!filePath.endsWith("/SKILL.md") && !filePath.endsWith("\\SKILL.md")) continue;

			let content: string;
			try {
				content = readFileSync(filePath, "utf-8");
			} catch {
				continue;
			}

			const fm = parseFrontmatter(content);
			const name = fm.name;
			if (!name) continue;

			const description = (fm.description || "").slice(0, 200);
			const repo = repoForPath(filePath);
			const relativePath = filePath.replace(cacheRoot + "/", "");
			const category = deriveCategory(relativePath);

			// Deduplicate by name (first win — repo order in SKILL_REPOS
			// determines priority)
			if (!entries.has(name)) {
				entries.set(name, {
					name,
					description,
					repo,
					category,
					applyTo: fm.applyTo as string | undefined,
				});
			}
		}

		// ── Phase 2: Merge product sources ───────────────────────────
		for (const product of PRODUCTS) {
			const entry: CatalogEntry = {
				name: product.name,
				description: `${product.label} — documentation available at ${product.mcpUrl.replace("/~gitbook/mcp", "")}`,
				repo: "sources.ts (product docs)",
				category: "product",
			};

			// Products override skill entries with same name
			entries.set(product.name, entry);
		}

		this.entries = [...entries.values()];
		return this.entries;
	}

	format(
		entries: CatalogEntry[],
		options?: { filter?: string; group?: string },
	): string {
		let filtered = entries;

		// ── Apply filter ─────────────────────────────────────────────
		const filter = options?.filter?.trim().toLowerCase();
		if (filter) {
			filtered = filtered.filter(
				(e) =>
					e.name.toLowerCase().includes(filter) ||
					e.description.toLowerCase().includes(filter),
			);
		}

		// ── Apply group ──────────────────────────────────────────────
		const group = options?.group?.trim().toLowerCase() || "all";
		// Map plural enum labels to singular category values
		const groupMap: Record<string, string> = {
			products: "product",
			modules: "module",
			concepts: "concept",
		};
		const targetCategory = groupMap[group];
		if (targetCategory) {
			filtered = filtered.filter((e) => e.category === targetCategory);
		}

		// ── Sort: category order, then name ──────────────────────────
		const categoryOrder: Record<string, number> = {
			product: 0,
			module: 1,
			concept: 2,
			general: 3,
		};
		filtered.sort((a, b) => {
			const ca = categoryOrder[a.category] ?? 99;
			const cb = categoryOrder[b.category] ?? 99;
			if (ca !== cb) return ca - cb;
			return a.name.localeCompare(b.name);
		});

		// ── Build markdown output ────────────────────────────────────
		const parts: string[] = [];

		// Group into sections for readability when showing all
		const showGrouped = group === "all" && !filter;

		if (showGrouped) {
			// Products section
			const products = filtered.filter((e) => e.category === "product");
			if (products.length > 0) {
				parts.push("## Products — documentation MCP endpoints\n");
				parts.push("| Name | Description |");
				parts.push("|------|-------------|");
				for (const p of products) {
					parts.push(`| ${p.name} | ${p.description} |`);
				}
				parts.push("");
			}

			// Modules section
			const modules = filtered.filter((e) => e.category === "module");
			if (modules.length > 0) {
				parts.push(`## Modules — ${modules.length} package-specific skills\n`);
				parts.push("| Name | Description | Repo |");
				parts.push("|------|-------------|------|");
				for (const m of modules) {
					parts.push(
						`| ${m.name} | ${m.description.replace(/\n/g, " ")} | ${m.repo} |`,
					);
				}
				parts.push("");
			}

			// Concepts section
			const concepts = filtered.filter((e) => e.category === "concept");
			if (concepts.length > 0) {
				parts.push(`## Concepts — ${concepts.length} cross-cutting skills\n`);
				parts.push("| Name | Description | Repo |");
				parts.push("|------|-------------|------|");
				for (const c of concepts) {
					parts.push(
						`| ${c.name} | ${c.description.replace(/\n/g, " ")} | ${c.repo} |`,
					);
				}
				parts.push("");
			}

			// General section
			const general = filtered.filter((e) => e.category === "general");
			if (general.length > 0) {
				parts.push(`## General — ${general.length} cross-ecosystem skills\n`);
				parts.push("| Name | Description | Repo |");
				parts.push("|------|-------------|------|");
				for (const g of general) {
					parts.push(
						`| ${g.name} | ${g.description.replace(/\n/g, " ")} | ${g.repo} |`,
					);
				}
				parts.push("");
			}
		} else {
			// Flat list — when filtered or grouped
			parts.push("| Name | Category | Description | Repo |");
			parts.push("|------|----------|-------------|------|");
			for (const e of filtered) {
				parts.push(
					`| ${e.name} | ${e.category} | ${e.description.replace(/\n/g, " ")} | ${e.repo} |`,
				);
			}
			parts.push("");
		}

		// ── Summary ──────────────────────────────────────────────────
		const total = filtered.length;
		const productCount = filtered.filter((e) => e.category === "product").length;
		const moduleCount = filtered.filter((e) => e.category === "module").length;
		const conceptCount = filtered.filter((e) => e.category === "concept").length;
		const generalCount = filtered.filter((e) => e.category === "general").length;

		parts.push(
			`---\n_${total} entries (${productCount} products, ${moduleCount} modules, ${conceptCount} concepts, ${generalCount} general)_`,
		);

		if (!filter && !showGrouped) {
			parts.push(
				"\n> **Tip:** Use `ortus_catalog({ group: \"modules\" })` to see only module skills, or `ortus_catalog({ filter: \"queue\" })` to search by keyword.",
			);
		}

		return parts.join("\n");
	}
}
