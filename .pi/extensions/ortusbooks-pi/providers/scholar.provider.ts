/**
 * Provider for the `ortus_scholar` tool.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import type { IScholarService } from "../core/types.ts";

export function registerScholarProvider(
	pi: ExtensionAPI,
	scholarService: IScholarService,
): void {
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
				description:
					"What to research or build context for (e.g. 'porting BXAI RAG to MXAI')",
			}),
			products: Type.Optional(
				Type.Array(
					StringEnum(
						["boxlang", "coldbox", "commandbox", "wirebox", "testbox", "cachebox", "logbox", "quick", "qb"] as const,
					),
					{ description: "Products to focus on (default: all core)" },
				),
			),
			depth: Type.Optional(
				StringEnum(["quick", "thorough"] as const, {
					description: "Research depth",
					default: "quick",
				}),
			),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			const text = await scholarService.research(params.task, {
				products: params.products,
				depth: params.depth,
				signal,
			});
			return { content: [{ type: "text" as const, text }], details: {} };
		},
	});
}
