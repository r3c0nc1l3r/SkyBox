/**
 * SSE MCP client for Ortus GitBook documentation endpoints.
 *
 * Each product exposes a JSON-RPC MCP endpoint over SSE transport at
 * `/~gitbook/mcp`. Requests use HTTP POST with a JSON-RPC 2.0 body and
 * expect an SSE `event: message\ndata: {...}\n\n` response.
 *
 * Despite the SSE framing, each request produces a single synchronous
 * data event — no streaming, no persistent connection needed.
 *
 * Responses are cached via the shared TTLCache instance to reduce
 * redundant network calls within the TTL window.
 */

import type { ProductSource } from "./sources.ts";
import { TTLCache } from "./cache-manager.ts";

/** MCP tool call result from a product endpoint */
export interface MCPResult {
	text: string;
}

/** Shared MCP response cache (5-minute TTL) */
export const mcpCache = new TTLCache(300_000);

/**
 * Call an MCP tool on a product's documentation endpoint.
 *
 * @param product - The product source definition
 * @param toolName - Tool to invoke ("searchDocumentation" or "getPage")
 * @param args - Tool arguments (e.g. { query: "..." } or { url: "..." })
 * @param signal - Optional AbortSignal for cancellation
 * @returns The text content from the MCP response
 * @throws If the endpoint is unreachable, returns an error, or response is malformed
 */
export async function callMCPTool(
	product: ProductSource,
	toolName: string,
	args: Record<string, unknown>,
	signal?: AbortSignal,
): Promise<string> {
	// ── Check cache ────────────────────────────────────────────────
	const queryArg = args.query as string | undefined;
	const urlArg = args.url as string | undefined;
	let cacheKey: string | undefined;

	if (toolName === "searchDocumentation" && queryArg) {
		cacheKey = TTLCache.searchKey(product.name, queryArg);
	} else if (toolName === "getPage" && urlArg) {
		cacheKey = TTLCache.pageKey(urlArg);
	}

	if (cacheKey) {
		const cached = mcpCache.get(cacheKey);
		if (cached !== undefined) return cached;
	}

	// ── Fetch ──────────────────────────────────────────────────────
	const response = await fetch(product.mcpUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			// The MCP endpoint requires both content types in the Accept header
			Accept: "application/json, text/event-stream",
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: "1",
			method: "tools/call",
			params: {
				name: toolName,
				arguments: args,
			},
		}),
		signal,
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(
			`${product.label} MCP returned HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
		);
	}

	const raw = await response.text();

	// Parse SSE: find the first "data: " line and extract the JSON
	const dataLine = raw
		.split("\n")
		.map((l) => l.trim())
		.find((l) => l.startsWith("data: "));

	if (!dataLine) {
		throw new Error(`${product.label} MCP: unexpected response format (no SSE data found)`);
	}

	let parsed: any;
	try {
		parsed = JSON.parse(dataLine.slice(6));
	} catch {
		throw new Error(`${product.label} MCP: failed to parse SSE data as JSON`);
	}

	if (parsed.error) {
		throw new Error(`${product.label} MCP error: ${parsed.error.message || JSON.stringify(parsed.error)}`);
	}

	const text = parsed?.result?.content?.[0]?.text;
	if (typeof text !== "string") {
		throw new Error(`${product.label} MCP: response missing text content`);
	}

	// ── Cache the result ───────────────────────────────────────────
	if (cacheKey) {
		mcpCache.set(cacheKey, text);
	}

	return text;
}

/**
 * Search documentation for a product.
 * Calls the MCP `searchDocumentation` tool.
 */
export async function searchProduct(
	product: ProductSource,
	query: string,
	signal?: AbortSignal,
): Promise<string> {
	return callMCPTool(product, "searchDocumentation", { query }, signal);
}

/**
 * Fetch a full documentation page.
 * Calls the MCP `getPage` tool.
 */
export async function getPage(
	product: ProductSource,
	url: string,
	signal?: AbortSignal,
): Promise<string> {
	return callMCPTool(product, "getPage", { url }, signal);
}
