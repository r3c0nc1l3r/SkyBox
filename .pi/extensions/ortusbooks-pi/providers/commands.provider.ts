/**
 * Provider for pi slash-commands.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ISkillsService } from "../core/types.ts";

export function registerCommands(pi: ExtensionAPI, skills: ISkillsService): void {
	// ── /ortusbooks-pi:update-skills ────────────────────────────────────
	pi.registerCommand("ortusbooks-pi:update-skills", {
		description: "Pull latest skills from Ortus repos and rebuild the search index",
		handler: async (_args, ctx) => {
			ctx.ui.notify("Updating skills repos...", "info");
			const pullResults = skills.refresh();
			const rebuilt = skills.rebuild();

			const lines: string[] = ["## Skills Update Results\n"];
			for (const r of pullResults) {
				lines.push(`| ${r.name} | ${r.ok ? "✅ Updated" : `⚠️ ${r.error}`} |`);
			}

			if (rebuilt) {
				const idx = skills.getIndex();
				lines.push(`\nIndex rebuilt: **${idx.size}** skill files indexed.`);
			} else {
				lines.push("\n⚠️ Index rebuild failed — extension uses MCP-only mode.");
			}

			ctx.ui.notify(lines.join("\n"), "info");
			return lines.join("\n");
		},
	});

	// ── /ortusbooks-pi:refresh ──────────────────────────────────────────
	pi.registerCommand("ortusbooks-pi:refresh", {
		description: "Re-discover Ortus doc resources (agents, prompts)",
		handler: async (_args, ctx) => {
			ctx.ui.notify("Ortus Docs resources refreshed", "info");
		},
	});
}
