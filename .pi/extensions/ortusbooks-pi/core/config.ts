/**
 * Centralized application configuration.
 * All tunable constants live here instead of scattered as module-level consts.
 */
export class AppConfig {
	readonly maxConcurrency = 4;
	readonly mcpTimeoutMs = 10_000;
	readonly defaultMaxResults = 5;
	readonly defaultPageMaxLength = 8_000;
	readonly scholarReadDepth = 3;
	readonly skillsMatchThreshold = 0.3;
	readonly mcpCacheTtlMs = 300_000;
	readonly scholarMaxOutputBytes = 50_000;
}
