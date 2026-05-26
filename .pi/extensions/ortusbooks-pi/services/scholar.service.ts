/**
 * Scholar service — deep-dive Ortus ecosystem context builder.
 *
 * Three-phase pipeline:
 *   Phase 0: Skills context (relevant AI skills)
 *   Phase 1: MCP search across products
 *   Phase 2: Read top pages for deeper context
 *   Phase 3: Assemble structured context pack
 */

import type { AppConfig } from "../core/config.ts";
import type { IMcpService, ISkillsService, IScholarService } from "../core/types.ts";
import { PRODUCTS, findProduct } from "../sources.ts";
import { makeAbortSignal } from "../lib/abort.ts";
import { mapWithConcurrency } from "../lib/concurrency.ts";
import { extractUrls, extractTitle, getProductRole } from "../lib/formatters.ts";

export class ScholarService implements IScholarService {
	constructor(
		private config: AppConfig,
		private mcp: IMcpService,
		private skills: ISkillsService,
	) {}

	async research(
		task: string,
		options: {
			products?: string[];
			depth?: "quick" | "thorough";
			signal?: AbortSignal;
		},
	): Promise<string> {
		const trimT = task.trim();
		if (!trimT) return "Please provide a non-empty task.";

		const productsToSearch = options.products?.length
			? options.products.map((n) => findProduct(n)).filter(Boolean)
			: PRODUCTS.filter((p) => p.priority === "core");

		if (productsToSearch.length === 0) return "No valid products specified.";

		const isThorough = options.depth === "thorough";
		const timeout = this.config.mcpTimeoutMs * (isThorough ? 3 : 2);
		const combinedSignal = makeAbortSignal(options.signal, timeout);

		const sections: string[] = [];

		try {
			// ── Phase 0: Skills context ──────────────────────────────
			if (this.skills.getIndex().isReady) {
				const skillHits = this.skills.search(trimT, 3);
				if (skillHits.length > 0) {
					const skillLines: string[] = ["## Relevant AI Skills\n"];
					for (const sh of skillHits) {
						skillLines.push(
							`- **${sh.title}** (${sh.repo}) — relevance: ${(sh.score * 100).toFixed(0)}%`,
						);
						skillLines.push(`  \`${sh.snippet}\``);
					}
					sections.push(skillLines.join("\n"));
				}
			}

			// ── Phase 1: Search all products ─────────────────────────
			const searchResults = await mapWithConcurrency(
				productsToSearch,
				this.config.maxConcurrency,
				async (product) => {
					try {
						const text = await this.mcp.searchProduct(product, trimT, combinedSignal);
						return { product, text, error: null };
					} catch (err: any) {
						return { product, text: "", error: err.message };
					}
				},
			);

			// ── Phase 2: Read top pages ─────────────────────────────
			const readCount = isThorough ? this.config.scholarReadDepth : 1;
			const pagesToRead: { product: (typeof PRODUCTS)[0]; url: string }[] = [];

			for (const r of searchResults) {
				if (r.error || !r.text.trim()) continue;
				const urls = extractUrls(r.text);
				for (const url of urls.slice(0, readCount)) {
					pagesToRead.push({ product: r.product, url });
				}
			}

			const pageContents = await mapWithConcurrency(
				pagesToRead.slice(0, isThorough ? 9 : 3),
				this.config.maxConcurrency,
				async ({ product, url }) => {
					try {
						const text = await this.mcp.getPage(product, url, combinedSignal);
						return { product, url, text, error: null };
					} catch (err: any) {
						return { product, url, text: "", error: err.message };
					}
				},
			);

			// ── Phase 3: Assemble context pack ──────────────────────

			// Ecosystem Map
			const ecoLines: string[] = ["## Ecosystem Map\n"];
			ecoLines.push(`Research task: **${trimT}**`);
			ecoLines.push(`Products searched: ${productsToSearch.map((p) => p.label).join(", ")}`);
			ecoLines.push("");
			ecoLines.push("| Product | Role | Status |");
			ecoLines.push("|---------|------|--------|");
			for (const r of searchResults) {
				const status = r.error
					? `⚠️ Error: ${r.error}`
					: r.text.trim()
						? "✅ Found"
						: "🔍 No results";
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
					pageLines.push(
						`- ✅ ${p.product.label} — [${extractTitle(p.text) || "Page"}](${p.url})`,
					);
					pageLines.push("  ```");
					pageLines.push(p.text.substring(0, 1500).replace(/\n/g, "\n  "));
					pageLines.push("  ```");
				}
			}
			sections.push(pageLines.join("\n"));

			// Architecture & Guidance
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

			return header + body.substring(0, this.config.scholarMaxOutputBytes);
		} catch (err: any) {
			throw new Error(`Ortus Scholar error: ${err.message}`);
		}
	}
}
