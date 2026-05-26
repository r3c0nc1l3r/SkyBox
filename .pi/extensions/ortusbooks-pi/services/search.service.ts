/**
 * Search service — hybrid search orchestrator.
 *
 * Two-phase flow:
 *   Phase 0: Skills FTS index (fast, offline)
 *   Phase 1: MCP documentation search (network, cached)
 */

import type { AppConfig } from "../core/config.ts";
import type { IMcpService, ISkillsService, ISearchService } from "../core/types.ts";
import { PRODUCTS, findProduct, validProductNames } from "../sources.ts";
import { makeAbortSignal } from "../lib/abort.ts";
import { mapWithConcurrency } from "../lib/concurrency.ts";
import { formatSkillsResponse, formatSearchResult } from "../lib/formatters.ts";

export class SearchService implements ISearchService {
	constructor(
		private config: AppConfig,
		private mcp: IMcpService,
		private skills: ISkillsService,
	) {}

	async search(
		query: string,
		options: {
			product?: string;
			maxResults?: number;
			signal?: AbortSignal;
		},
	): Promise<string> {
		const trimQ = query.trim();
		if (!trimQ) return "Please provide a non-empty search query.";

		const maxResults = options.maxResults ?? this.config.defaultMaxResults;

		// ── Phase 0: Skills index search ─────────────────────────────
		const skillResults = this.skills.getIndex().isReady
			? this.skills.search(trimQ, maxResults)
			: [];

		const strongSkillHits = skillResults.filter(
			(r) => r.score >= this.config.skillsMatchThreshold,
		);

		// ── Phase 1: MCP documentation search ────────────────────────
		const productsToSearch = options.product
			? [findProduct(options.product)].filter(Boolean)
			: PRODUCTS;

		if (productsToSearch.length === 0) {
			if (strongSkillHits.length > 0) {
				return (
					formatSkillsResponse(trimQ, skillResults, []) +
					"\n\n_(MCP search skipped — no valid product)_"
				);
			}
			return `Unknown product "${options.product}". Valid products: ${validProductNames()}.`;
		}

		const combinedSignal = makeAbortSignal(options.signal, this.config.mcpTimeoutMs);
		let mcpResults: { product: (typeof PRODUCTS)[0]; text: string; error: string | null }[] = [];

		try {
			mcpResults = await mapWithConcurrency(
				productsToSearch,
				this.config.maxConcurrency,
				async (product) => {
					try {
						const text = await this.mcp.searchProduct(product, trimQ, combinedSignal);
						return { product, text, error: null };
					} catch (err: any) {
						return { product, text: "", error: err.message };
					}
				},
			);
		} catch (err: any) {
			if (skillResults.length > 0) {
				return (
					formatSkillsResponse(trimQ, skillResults, []) +
					"\n\n---\n⚠️ MCP search failed, showing skills-only results."
				);
			}
			throw new Error(`MCP search error: ${err.message}`);
		}

		// ── Format combined results ──────────────────────────────────
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

		const parts: string[] = [];
		const header = options.product
			? `# Search: "${trimQ}" in ${productsToSearch[0].label}\n\n`
			: `# Search: "${trimQ}" across ${productsToSearch.length} products\n\n`;

		if (strongSkillHits.length > 0) {
			const prefix =
				strongSkillHits.length >= maxResults
					? "**Source: Local skills index** (offline, no MCP call needed)"
					: "**Source: Local skills index** (augmented with MCP results below)";
			parts.push(
				formatSkillsResponse(trimQ, skillResults, []).replace(/^# /, "## ") +
					`\n\n_${prefix}_`,
			);
		}

		if (mcpHasResults) {
			const mcpBody = mcpParts.join("\n\n---\n\n");
			if (strongSkillHits.length > 0) {
				parts.push("## Documentation Search Results\n" + mcpBody);
			} else {
				parts.push(mcpBody);
			}
		}

		if (parts.length === 0) {
			return `No results found for "${trimQ}" in skills or documentation.`;
		}

		return header + parts.join("\n\n---\n\n");
	}
}
