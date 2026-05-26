/**
 * Skills repository manager.
 *
 * Clones and maintains local copies of 3 Ortus skill repos for offline
 * vector/FTS search. All operations are non-fatal — if git fails, the
 * extension falls through to MCP-only mode.
 */

import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import * as os from "node:os";
import { join, relative } from "node:path";

// ── Repo definitions ──────────────────────────────────────────────────

export interface SkillRepo {
	/** Display name for the repo */
	name: string;
	/** Git clone URL */
	url: string;
	/** Local directory name under cache root */
	dir: string;
}

export const SKILL_REPOS: SkillRepo[] = [
	{
		name: "Ortus Solutions Skills",
		url: "https://github.com/Ortus-Solutions/skills.git",
		dir: "ortus-solutions-skills",
	},
	{
		name: "BoxLang Skills",
		url: "https://github.com/ortus-boxlang/skills.git",
		dir: "ortus-boxlang-skills",
	},
	{
		name: "ColdBox Skills",
		url: "https://github.com/ColdBox/skills.git",
		dir: "coldbox-skills",
	},
];

/** Root directory for cached skills repos */
export function skillsCacheDir(): string {
	return join(os.homedir(), ".ortusbooks-pi", "skills");
}

/** Get the local path for a repo */
export function repoDir(repo: SkillRepo): string {
	return join(skillsCacheDir(), repo.dir);
}

/**
 * Ensure all skill repos are cloned locally (shallow).
 * Returns count of newly cloned repos.
 */
export function ensureSkills(): number {
	let cloned = 0;
	const root = skillsCacheDir();
	if (!existsSync(root)) {
		mkdirSync(root, { recursive: true });
	}

	for (const repo of SKILL_REPOS) {
		const local = repoDir(repo);
		if (!existsSync(local)) {
			try {
				execFileSync("git", ["clone", "--depth", "1", repo.url, local], {
					stdio: "ignore",
					timeout: 30_000,
				});
				cloned++;
			} catch {
				// Non-fatal — extension works without skills
			}
		}
	}

	return cloned;
}

/**
 * Pull latest for all repos (fast-forward only).
 * Returns { repo: success } summary.
 */
export function refreshSkills(): { name: string; ok: boolean; error?: string }[] {
	const results: { name: string; ok: boolean; error?: string }[] = [];

	for (const repo of SKILL_REPOS) {
		const local = repoDir(repo);
		if (!existsSync(local)) {
			results.push({ name: repo.name, ok: false, error: "not cloned" });
			continue;
		}

		try {
			execFileSync("git", ["pull", "--ff-only"], {
				cwd: local,
				stdio: "ignore",
				timeout: 30_000,
			});
			results.push({ name: repo.name, ok: true });
		} catch (err: any) {
			results.push({ name: repo.name, ok: false, error: err.message || String(err) });
		}
	}

	return results;
}

/**
 * Recursively discover all .md files across all cloned repos.
 * Returns absolute file paths.
 */
export function discoverSkillFiles(): string[] {
	const files: string[] = [];
	const root = skillsCacheDir();
	if (!existsSync(root)) return files;

	for (const repo of SKILL_REPOS) {
		const local = repoDir(repo);
		if (!existsSync(local)) continue;
		walkMdFiles(local, files);
	}

	return files;
}

/** Recursive walk for .md files, honouring node_modules/.git exclusion */
function walkMdFiles(dir: string, accumulator: string[]): void {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return;
	}

	for (const entry of entries) {
		// Skip hidden dirs and common non-content dirs
		if (entry === ".git" || entry === "node_modules" || entry === ".DS_Store") continue;

		const full = join(dir, entry);
		let stat: ReturnType<typeof statSync>;
		try {
			stat = statSync(full);
		} catch {
			continue;
		}

		if (stat.isDirectory()) {
			walkMdFiles(full, accumulator);
		} else if (stat.isFile() && entry.endsWith(".md")) {
			accumulator.push(full);
		}
	}
}

/**
 * Get the repo name for a given skill file path.
 * Returns "unknown" if no repo matched.
 */
export function repoForPath(filePath: string): string {
	for (const repo of SKILL_REPOS) {
		if (filePath.includes(repo.dir)) return repo.name;
	}
	return "unknown";
}
