/**
 * Simple TTL-based in-memory cache for MCP results.
 *
 * Keys are strings (e.g. "search:product:query" or "page:url").
 * Values are the raw text responses from MCP endpoints.
 * Expired entries are lazily purged on get().
 */

export interface CacheEntry {
	data: string;
	timestamp: number;
}

export class TTLCache {
	private store = new Map<string, CacheEntry>();
	private _hits = 0;
	private _misses = 0;

	constructor(private ttlMs: number = 300_000) {}

	/** Build a cache key for a search query */
	static searchKey(product: string, query: string): string {
		return `search:${product}:${query.toLowerCase().trim()}`;
	}

	/** Build a cache key for a page URL */
	static pageKey(url: string): string {
		return `page:${url}`;
	}

	/** Check if a key exists and is fresh */
	has(key: string): boolean {
		const entry = this.store.get(key);
		if (!entry) return false;
		if (Date.now() - entry.timestamp > this.ttlMs) {
			this.store.delete(key);
			return false;
		}
		return true;
	}

	/** Get a cached value. Returns undefined if missing or expired. */
	get(key: string): string | undefined {
		const entry = this.store.get(key);
		if (!entry) {
			this._misses++;
			return undefined;
		}
		if (Date.now() - entry.timestamp > this.ttlMs) {
			this.store.delete(key);
			this._misses++;
			return undefined;
		}
		this._hits++;
		return entry.data;
	}

	/** Store a value with current timestamp */
	set(key: string, data: string): void {
		this.store.set(key, { data, timestamp: Date.now() });
	}

	/** Number of entries in the cache (including expired; lazily cleaned) */
	get size(): number {
		return this.store.size;
	}

	/** Hit count */
	get hits(): number {
		return this._hits;
	}

	/** Miss count */
	get misses(): number {
		return this._misses;
	}

	/** Clear all entries */
	clear(): void {
		this.store.clear();
		this._hits = 0;
		this._misses = 0;
	}

	/** Purge expired entries */
	prune(): number {
		const now = Date.now();
		let pruned = 0;
		for (const [key, entry] of this.store) {
			if (now - entry.timestamp > this.ttlMs) {
				this.store.delete(key);
				pruned++;
			}
		}
		return pruned;
	}
}
