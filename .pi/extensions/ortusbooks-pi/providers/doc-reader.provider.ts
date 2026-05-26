/**
 * Provider for the `read_ortus_doc` tool.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { IMcpService } from "../core/types.ts";
import type { AppConfig } from "../core/config.ts";
import { PRODUCTS, isKnownOrtusUrl, validProductNames } from "../sources.ts";
import { makeAbortSignal } from "../lib/abort.ts";

export function registerDocReaderProvider(
	pi: ExtensionAPI,
	config: AppConfig,
	mcpService: IMcpService,
): void {
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
				Type.Number({
					description: "Max content length",
					default: config.defaultPageMaxLength,
				}),
			),
		}),

		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			const url = params.url.trim();

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
					details: {},
				};
			}

			const product = PRODUCTS.find((p) => {
				const host = new URL(p.mcpUrl).host;
				return url.includes(host);
			});

			if (!product) {
				return {
					content: [
						{ type: "text" as const, text: `Could not determine product for URL: ${url}` },
					],
					details: {},
				};
			}

			const maxLength = params.maxLength ?? config.defaultPageMaxLength;
			const combinedSignal = makeAbortSignal(signal, config.mcpTimeoutMs);

			try {
				const text = await mcpService.getPage(product, url, combinedSignal);
				if (text.length > maxLength) {
					return {
						content: [
							{
								type: "text" as const,
								text:
									text.slice(0, maxLength) +
									`\n\n[...content truncated at ${maxLength} bytes]`,
							},
						],
						details: {},
					};
				}
				return { content: [{ type: "text" as const, text }], details: {} };
			} catch (err: any) {
				throw new Error(`Error reading Ortus doc page: ${err.message}`);
			}
		},
	});
}
