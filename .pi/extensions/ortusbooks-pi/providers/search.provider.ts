/**
 * Provider for the `search_ortus_docs` tool.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import type { ISearchService } from "../core/types.ts";

export function registerSearchProvider(pi: ExtensionAPI, searchService: ISearchService): void {
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
			query: Type.String({
				description: "Search query (e.g. 'dependency injection', 'scheduled tasks')",
			}),
			product: Type.Optional(
				StringEnum(
					[
						"",
						"boxlang",
						"coldbox",
						"commandbox",
						"wirebox",
						"testbox",
						"cachebox",
						"logbox",
						"quick",
						"qb",
						"contentbox",
						"docbox",
					] as const,
					{ description: "Filter to one product. Omit to search all products.", default: "" },
				),
			),
			maxResults: Type.Optional(
				Type.Number({ description: "Max results per product", default: 5 }),
			),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			const text = await searchService.search(params.query, {
				product: params.product,
				maxResults: params.maxResults,
				signal,
			});
			return { content: [{ type: "text" as const, text }], details: {} };
		},
	});
}
