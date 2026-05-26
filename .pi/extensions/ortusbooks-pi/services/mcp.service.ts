/**
 * MCP service — wraps GitBook MCP documentation endpoints with caching.
 */

import type { ProductSource } from "../sources.ts";
import { searchProduct, getPage, mcpCache } from "../mcp-client.ts";
import type { AppConfig } from "../core/config.ts";
import type { IMcpService } from "../core/types.ts";

export class McpService implements IMcpService {
	constructor(private config: AppConfig) {}

	async searchProduct(
		product: ProductSource,
		query: string,
		signal?: AbortSignal,
	): Promise<string> {
		return searchProduct(product, query, signal);
	}

	async getPage(
		product: ProductSource,
		url: string,
		signal?: AbortSignal,
	): Promise<string> {
		return getPage(product, url, signal);
	}

	getCacheStats(): { hits: number; misses: number; size: number } {
		return {
			hits: mcpCache.hits,
			misses: mcpCache.misses,
			size: mcpCache.size,
		};
	}
}
