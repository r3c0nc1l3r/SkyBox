/**
 * Manual DI container (Pure DI) for the ortusbooks-pi extension.
 *
 * Instantiates all services with their dependencies and wires every
 * provider (tool registrations, commands, events).
 *
 * No decorators, no reflect-metadata, no external DI library needed.
 * The tsyringe experiment proved incompatible with tsx/esbuild (no
 * experimentalDecorators support). This approach is cleaner and
 * produces the same architecture.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { AppConfig } from "./config.ts";
import { McpService } from "../services/mcp.service.ts";
import { SkillsService } from "../services/skills.service.ts";
import { SearchService } from "../services/search.service.ts";
import { ScholarService } from "../services/scholar.service.ts";
import { CatalogService } from "../services/catalog.service.ts";

import { registerSearchProvider } from "../providers/search.provider.ts";
import { registerDocReaderProvider } from "../providers/doc-reader.provider.ts";
import { registerScholarProvider } from "../providers/scholar.provider.ts";
import { registerCatalogProvider } from "../providers/catalog.provider.ts";
import { registerCommands } from "../providers/commands.provider.ts";
import { registerStartup } from "../providers/startup.provider.ts";

export function bootstrapExtension(pi: ExtensionAPI): void {
	// ── Instantiate services (Pure DI) ────────────────────────────────
	const config = new AppConfig();
	const mcpService = new McpService(config);
	const skillsService = new SkillsService(config);
	const searchService = new SearchService(config, mcpService, skillsService);
	const scholarService = new ScholarService(config, mcpService, skillsService);
	const catalogService = new CatalogService();

	// ── Register all providers ────────────────────────────────────────
	registerSearchProvider(pi, searchService);
	registerCatalogProvider(pi, catalogService);
	registerDocReaderProvider(pi, config, mcpService);
	registerScholarProvider(pi, scholarService);
	registerCommands(pi, skillsService);
	registerStartup(pi, skillsService);
}
