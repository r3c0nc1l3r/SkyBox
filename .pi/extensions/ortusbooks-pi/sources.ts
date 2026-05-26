/**
 * Ortus product documentation sources and their MCP endpoint URLs.
 *
 * Each product hosted on `*.ortusbooks.com` exposes a GitBook MCP endpoint
 * at `/~gitbook/mcp` with `searchDocumentation(query)` and `getPage(url)` tools.
 */
export interface ProductSource {
	/** Canonical slug (e.g. "boxlang", "coldbox") */
	name: string;
	/** Human-readable label (e.g. "BoxLang", "ColdBox") */
	label: string;
	/** Full MCP endpoint URL */
	mcpUrl: string;
	/** Priority tier for search ordering */
	priority: "core" | "important" | "niche";
}

export const PRODUCTS: ProductSource[] = [
	// --- Core ---
	{ name: "boxlang", label: "BoxLang", mcpUrl: "https://boxlang.ortusbooks.com/~gitbook/mcp", priority: "core" },
	{ name: "coldbox", label: "ColdBox", mcpUrl: "https://coldbox.ortusbooks.com/~gitbook/mcp", priority: "core" },
	{ name: "commandbox", label: "CommandBox", mcpUrl: "https://commandbox.ortusbooks.com/~gitbook/mcp", priority: "core" },
	{ name: "wirebox", label: "WireBox", mcpUrl: "https://wirebox.ortusbooks.com/~gitbook/mcp", priority: "core" },

	// --- Important ---
	{ name: "testbox", label: "TestBox", mcpUrl: "https://testbox.ortusbooks.com/~gitbook/mcp", priority: "important" },
	{ name: "cachebox", label: "CacheBox", mcpUrl: "https://cachebox.ortusbooks.com/~gitbook/mcp", priority: "important" },
	{ name: "logbox", label: "LogBox", mcpUrl: "https://logbox.ortusbooks.com/~gitbook/mcp", priority: "important" },
	{ name: "quick", label: "Quick ORM", mcpUrl: "https://quick.ortusbooks.com/~gitbook/mcp", priority: "important" },
	{ name: "qb", label: "qb", mcpUrl: "https://qb.ortusbooks.com/~gitbook/mcp", priority: "important" },

	// --- Niche ---
	{ name: "contentbox", label: "ContentBox", mcpUrl: "https://contentbox.ortusbooks.com/~gitbook/mcp", priority: "niche" },
	{ name: "docbox", label: "DocBox", mcpUrl: "https://docbox.ortusbooks.com/~gitbook/mcp", priority: "niche" },
];

/** Look up a product by name/slug. Returns undefined if not found. */
export function findProduct(name: string): ProductSource | undefined {
	return PRODUCTS.find((p) => p.name === name);
}

/** Get all valid product names as a string list for error messages. */
export function validProductNames(): string {
	return PRODUCTS.map((p) => `"${p.name}"`).join(", ");
}

/** Check if a URL belongs to any known product's base domain. */
export function isKnownOrtusUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return PRODUCTS.some((p) => {
			const mcpHost = new URL(p.mcpUrl).host;
			return parsed.host === mcpHost;
		});
	} catch {
		return false;
	}
}
