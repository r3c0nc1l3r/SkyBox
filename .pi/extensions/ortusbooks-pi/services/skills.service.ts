/**
 * Skills service — manages cloning, indexing, and searching the 3 skill repos.
 */

import { SkillsIndex, type SkillResult } from "../skills-index.ts";
import { ensureSkills, refreshSkills, discoverSkillFiles } from "../skills-repo.ts";
import type { AppConfig } from "../core/config.ts";
import type { ISkillsService } from "../core/types.ts";

export class SkillsService implements ISkillsService {
	private index = new SkillsIndex();
	private _built = false;

	constructor(private config: AppConfig) {}

	ensureBuilt(): boolean {
		if (this._built && this.index.isReady) return true;
		try {
			ensureSkills();
			this.index.build();
			this._built = this.index.isReady;
		} catch {
			this._built = false;
		}
		return this._built;
	}

	getIndex(): { size: number; isReady: boolean } {
		return { size: this.index.size, isReady: this.index.isReady };
	}

	search(query: string, topK: number = 5): SkillResult[] {
		if (!this.index.isReady) return [];
		return this.index.search(query, topK);
	}

	rebuild(): boolean {
		try {
			this.index.build();
			this._built = this.index.isReady;
			return this._built;
		} catch {
			this._built = false;
			return false;
		}
	}

	refresh(): { name: string; ok: boolean; error?: string }[] {
		return refreshSkills();
	}
}
