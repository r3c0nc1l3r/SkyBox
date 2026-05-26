/**
 * Provider for the `ortus_catalog` tool.
 *
 * Dynamic ecosystem entity discovery: scans all skill repos + product
 * sources at call time to build a living catalog. No hardcoded entity
 * lists. Zero context overhead — the LLM calls this only when it needs
 * orientation.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import type { ICatalogService } from "../core/types.ts";

export function registerCatalogProvider(
	pi: ExtensionAPI,
	catalogService: ICatalogService,
): void {
	pi.registerTool({
		name: "ortus_catalog",
		label: "Ortus Ecosystem Catalog",
		description: [
			"List all known Ortus ecosystem entities (products, modules, concepts)",
			"discovered dynamically from skill repos and product documentation sources.",
			"Use when exploring unfamiliar territory — e.g. 'I need a background job",
			"queue, what modules exist?' or 'what's available for query building?'.",
			"Results are grouped by category by default. Use filter/group to narrow.",
		].join(" "),
		parameters: Type.Object({
			filter: Type.Optional(
				Type.String({
					description:
						"Filter by name or keyword (e.g. 'queue', 'orm', 'security', 'cache')",
				}),
			),
			group: Type.Optional(
				StringEnum(
					["all", "products", "modules", "concepts"] as const,
					{
						description:
							"Show only one category: products (documentation endpoints), modules (package-specific skills), or concepts (cross-cutting skills). Default: all, grouped by category.",
						default: "all",
					},
				),
			),
		}),

		async execute(_toolCallId, params) {
			const entries = catalogService.build();
			const text = catalogService.format(entries, {
				filter: params.filter,
				group: params.group === "all" ? undefined : params.group,
			});
			return { content: [{ type: "text" as const, text }], details: {} };
		},
	});
}
