/**
 * Result formatting helpers for LLM-consumable text output.
 * Extracted from the monolithic index.ts into a dedicated module.
 */

import type { SkillResult } from "../skills-index.ts";

/** Format skills search results for LLM consumption. */
export function formatSkillsResponse(
	query: string,
	results: SkillResult[],
	mcpInfo?: string[],
): string {
	if (results.length === 0) return "";

	const parts: string[] = [`# Skills: "${query}"\n`];

	for (const r of results) {
		const bar = "━".repeat(Math.round(r.score * 20));
		const percent = (r.score * 100).toFixed(0);
		parts.push(`## ${r.title}`);
		parts.push(`- **Repo:** ${r.repo}`);
		parts.push(`- **File:** \`${r.relativePath}\` (score: ${percent}% ${bar})`);
		parts.push(`> ${r.snippet}`);
		parts.push("");
	}

	if (mcpInfo && mcpInfo.length > 0) {
		parts.push("### MCP Fallback Results");
		parts.push(...mcpInfo);
	}

	return parts.join("\n");
}

/** Extract URLs from MCP searchDocumentation response text. */
export function extractUrls(text: string): string[] {
	const urls: string[] = [];
	for (const line of text.split("\n")) {
		const m = line.match(/^Link:\s*(https?:\/\/[^\s]+)/);
		if (m) urls.push(m[1].trim());
	}
	return urls;
}

/** Extract the first title from MCP response text. */
export function extractTitle(text: string): string | null {
	for (const line of text.split("\n")) {
		const m = line.match(/^Title:\s*(.+)/);
		if (m) return m[1].trim();
	}
	return null;
}

/** Get a human-readable role for a product. */
export function getProductRole(name: string): string {
	const roles: Record<string, string> = {
		boxlang: "Core language runtime",
		coldbox: "HMVC web framework",
		commandbox: "CLI + package manager + server",
		wirebox: "Dependency injection + AOP",
		testbox: "BDD/TDD testing framework",
		cachebox: "Enterprise caching",
		logbox: "Logging library",
		quick: "Active-record ORM",
		qb: "Fluent query builder",
		contentbox: "Modular CMS",
		docbox: "API documentation generator",
	};
	return roles[name] || "Ortus product";
}

/** Format a single product's MCP search result for LLM consumption. */
export function formatSearchResult(label: string, text: string, maxResults: number): string {
	const lines = text.split("\n");
	const parts: string[] = [`## ${label}`];

	let resultCount = 0;
	let currentSection = "";

	for (const line of lines) {
		if (resultCount >= maxResults) {
			parts.push("_(more results available — use a more specific query)_");
			break;
		}

		if (line.startsWith("Title:")) {
			if (currentSection) parts.push(currentSection.trimEnd());
			currentSection = line + "\n";
			resultCount++;
		} else if (line.startsWith("Link:") || line.startsWith("Content:")) {
			currentSection += line + "\n";
		} else if (currentSection && line.trim()) {
			currentSection += line + "\n";
		}
	}

	if (currentSection) parts.push(currentSection.trimEnd());

	return parts.join("\n");
}
