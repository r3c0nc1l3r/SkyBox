/**
 * Provider for the `session_start` event handler.
 */

import { copyFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import * as os from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ISkillsService } from "../core/types.ts";
import { PRODUCTS } from "../sources.ts";
import { discoverSkillFiles } from "../skills-repo.ts";

/** Path to the extension root directory */
const EXT_DIR = new URL("../..", import.meta.url).pathname;

export function registerStartup(pi: ExtensionAPI, skills: ISkillsService): void {
	pi.on("session_start", async (_event, ctx) => {
		// ── Install bundled agents ──────────────────────────────────
		const bundledAgentsDir = join(EXT_DIR, "agents");
		const userAgentsDir = join(os.homedir(), ".pi", "agent", "agents");

		try {
			if (!existsSync(userAgentsDir)) {
				mkdirSync(userAgentsDir, { recursive: true });
			}
			const agentFiles = readdirSync(bundledAgentsDir).filter((f) => f.endsWith(".md"));
			for (const file of agentFiles) {
				const dest = join(userAgentsDir, file);
				if (!existsSync(dest)) {
					copyFileSync(join(bundledAgentsDir, file), dest);
				}
			}
		} catch {
			// Non-fatal
		}

		// ── Initialize skills index ──────────────────────────────────
		let skillsNote = "skills: none";
		try {
			const ok = skills.ensureBuilt();
			if (ok) {
				const idx = skills.getIndex();
				skillsNote = `skills: ${idx.size} files indexed from 3 repos`;
			} else if (discoverSkillFiles().length > 0) {
				const rebuilt = skills.rebuild();
				if (rebuilt) {
					const idx = skills.getIndex();
					skillsNote = `skills: ${idx.size} files indexed from 3 repos`;
				}
			}
		} catch {
			skillsNote = "skills: failed to initialize";
		}

		ctx.ui.notify(
			`Ortus Docs: ${PRODUCTS.length} products, ${skillsNote}, ortus-scout + ortus-scholar agents`,
			"info",
		);
	});
}
