/**
 * Shared interfaces for the ortusbooks-pi extension.
 */

import type { ProductSource } from "../sources.ts";
import type { SkillResult } from "../skills-index.ts";

export interface ProductSearchResult {
	product: ProductSource;
	text: string;
	error: string | null;
}

export interface IMcpService {
	searchProduct(product: ProductSource, query: string, signal?: AbortSignal): Promise<string>;
	getPage(product: ProductSource, url: string, signal?: AbortSignal): Promise<string>;
	getCacheStats(): { hits: number; misses: number; size: number };
}

export interface ISkillsService {
	ensureBuilt(): boolean;
	getIndex(): { size: number; isReady: boolean };
	search(query: string, topK?: number): SkillResult[];
	rebuild(): boolean;
	refresh(): { name: string; ok: boolean; error?: string }[];
}

export interface ISearchService {
	search(
		query: string,
		options: {
			product?: string;
			maxResults?: number;
			signal?: AbortSignal;
		},
	): Promise<string>;
}

export interface CatalogEntry {
	name: string;
	description: string;
	repo: string;
	category: "module" | "concept" | "product" | "general";
	applyTo?: string;
}

export interface ICatalogService {
	/**
	 * Build the catalog from scratch (scans all skill repos + product sources).
	 */
	build(): CatalogEntry[];

	/**
	 * Format catalog entries as markdown, optionally filtered and grouped.
	 */
	format(
		entries: CatalogEntry[],
		options?: { filter?: string; group?: string },
	): string;
}

export interface IScholarService {
	research(
		task: string,
		options: {
			products?: string[];
			depth?: "quick" | "thorough";
			signal?: AbortSignal;
		},
	): Promise<string>;
}
