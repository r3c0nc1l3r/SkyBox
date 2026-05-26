/**
 * In-memory FTS (Full-Text Search) index over skill markdown files.
 *
 * Builds an inverted index from all SKILL.md (and README.md) files in
 * the cloned repos. Search uses simple token-frequency scoring with
 * title-weight boosting. No external dependencies.
 */

import { readFileSync } from "node:fs";
import { basename, relative } from "node:path";
import { discoverSkillFiles, repoForPath, skillsCacheDir } from "./skills-repo.ts";

// ── Types ─────────────────────────────────────────────────────────────

export interface SkillResult {
	/** Title of the skill (first h1 or filename) */
	title: string;
	/** Absolute path to the markdown file */
	path: string;
	/** Repro name (e.g. "Ortus Solutions Skills") */
	repo: string;
	/** Relative path from cache root for display */
	relativePath: string;
	/** Match score 0.0–1.0 */
	score: number;
	/** Context snippet around the best match (up to ~300 chars) */
	snippet: string;
}

interface IndexEntry {
	/** File id (just the path string used as key) */
	fileId: string;
	/** Number of times this token appeared in title (h1) */
	titleFreq: number;
	/** Number of times this token appeared in body */
	bodyFreq: number;
}

interface IndexFile {
	path: string;
	title: string;
	repo: string;
	relativePath: string;
	/** Raw content for snippet extraction */
	content: string;
}

// ── Stop words ────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
	"a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
	"of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
	"been", "being", "have", "has", "had", "do", "does", "did", "will",
	"would", "can", "could", "shall", "should", "may", "might", "must",
	"it", "its", "this", "that", "these", "those", "i", "you", "he", "she",
	"we", "they", "not", "no", "nor", "so", "if", "then", "than", "too",
	"very", "just", "about", "also", "more", "most", "some", "any", "each",
	"every", "all", "both", "few", "much", "many", "such", "which", "what",
	"who", "whom", "when", "where", "why", "how",
]);

// ── Tokenizer ─────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.split(/\s+/)
		.filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

// ── Extract title ──────────────────────────────────────────────────────

function extractTitle(content: string, filePath: string): string {
	// First try h1
	const m = content.match(/^#\s+(.+)/m);
	if (m) return m[1].trim();
	// Fallback: filename without extension
	return basename(filePath).replace(/\.md$/i, "");
}

// ── Split into title and body ─────────────────────────────────────────

interface ParsedDoc {
	title: string;
	titleText: string;
	bodyText: string;
}

function parseDocument(content: string, filePath: string): ParsedDoc {
	const title = extractTitle(content, filePath);

	// Find where the body starts (after first h1)
	const bodyStart = content.search(/^#\s+/m);
	const afterTitle = bodyStart >= 0 ? content.indexOf("\n", bodyStart) + 1 : 0;
	const bodyText = afterTitle > 0 ? content.slice(afterTitle) : content;

	return { title, titleText: title, bodyText };
}

// ── Index class ───────────────────────────────────────────────────────

export class SkillsIndex {
	/** token -> IndexEntry[] */
	private invertedIndex = new Map<string, IndexEntry[]>();
	/** fileId -> IndexFile */
	private files = new Map<string, IndexFile>();
	/** Total number of indexed files */
	private fileCount = 0;
	/** Whether the index has been built */
	private ready = false;

	/** Build (or rebuild) the index from all discovered skill files */
	build(): void {
		const mdFiles = discoverSkillFiles();
		this.invertedIndex.clear();
		this.files.clear();
		this.fileCount = 0;
		this.ready = false;

		const cacheRoot = skillsCacheDir();

		for (const filePath of mdFiles) {
			let content: string;
			try {
				content = readFileSync(filePath, "utf-8");
			} catch {
				continue; // skip unreadable
			}

			if (content.length < 20) continue; // skip near-empty files

			const doc = parseDocument(content, filePath);
			const rel = relative(cacheRoot, filePath);
			const repo = repoForPath(filePath);

			const fileId = filePath;
			this.files.set(fileId, {
				path: filePath,
				title: doc.title,
				repo,
				relativePath: rel,
				content,
			});

			// Index title tokens (weighted higher)
			const titleTokens = tokenize(doc.titleText);
			for (const token of titleTokens) {
				this._addToken(token, fileId, true);
			}

			// Index body tokens
			const bodyTokens = tokenize(doc.bodyText);
			for (const token of bodyTokens) {
				this._addToken(token, fileId, false);
			}

			this.fileCount++;
		}

		this.ready = true;
	}

	private _addToken(token: string, fileId: string, isTitle: boolean): void {
		let entries = this.invertedIndex.get(token);
		if (!entries) {
			entries = [];
			this.invertedIndex.set(token, entries);
		}

		let entry = entries.find((e) => e.fileId === fileId);
		if (!entry) {
			entry = { fileId, titleFreq: 0, bodyFreq: 0 };
			entries.push(entry);
		}

		if (isTitle) {
			entry.titleFreq++;
		} else {
			entry.bodyFreq++;
		}
	}

	/**
	 * Search the index for a query.
	 * Returns results sorted by relevance score (0.0–1.0).
	 */
	search(query: string, topK: number = 5): SkillResult[] {
		if (!this.ready || !query.trim()) return [];

		const queryTokens = tokenize(query);
		if (queryTokens.length === 0) return [];

		// Score each file: sum(titleWeight * titleFreq + bodyWeight * bodyFreq)
		// normalized by max score
		const scores = new Map<string, number>();
		const matchData = new Map<string, { tokens: Set<string>; allTokens: number }>();

		for (const qt of queryTokens) {
			const entries = this.invertedIndex.get(qt);
			if (!entries) continue;

			for (const entry of entries) {
				const current = scores.get(entry.fileId) ?? 0;
				const titleWeight = 10; // title matches weighted 10x
				const contribution = titleWeight * entry.titleFreq + entry.bodyFreq;
				scores.set(entry.fileId, current + contribution);

				if (!matchData.has(entry.fileId)) {
					matchData.set(entry.fileId, { tokens: new Set(), allTokens: queryTokens.length });
				}
				matchData.get(entry.fileId)!.tokens.add(qt);
			}
		}

		if (scores.size === 0) return [];

		// Normalize scores
		const maxScore = Math.max(...scores.values());
		const rawResults: { fileId: string; score: number; tokenRatio: number }[] = [];

		for (const [fileId, score] of scores) {
			const md = matchData.get(fileId)!;
			const normalized = maxScore > 0 ? score / maxScore : 0;
			// Boost by token coverage ratio
			const tokenRatio = md.tokens.size / md.allTokens;
			const finalScore = normalized * 0.7 + tokenRatio * 0.3;
			rawResults.push({ fileId, score: finalScore, tokenRatio });
		}

		// Sort by score descending
		rawResults.sort((a, b) => b.score - a.score);

		const results: SkillResult[] = [];
		for (const rr of rawResults.slice(0, topK)) {
			const file = this.files.get(rr.fileId);
			if (!file) continue;

			results.push({
				title: file.title,
				path: file.path,
				repo: file.repo,
				relativePath: file.relativePath,
				score: rr.score,
				snippet: extractSnippet(file.content, query),
			});
		}

		return results;
	}

	/** Number of indexed files */
	get size(): number {
		return this.fileCount;
	}

	/** Whether the index is built and ready */
	get isReady(): boolean {
		return this.ready;
	}
}

// ── Snippet extraction ────────────────────────────────────────────────

function extractSnippet(content: string, query: string, contextWords: number = 40): string {
	const lowerContent = content.toLowerCase();
	const queryLower = query.toLowerCase().trim();
	const queryTokens = queryLower.split(/\s+/).filter((t) => t.length > 1);

	if (queryTokens.length === 0) {
		return content.slice(0, 300).replace(/\n+/g, " ").trim();
	}

	// Find the first occurrence of any query token
	let bestIdx = -1;
	for (const token of queryTokens) {
		const idx = lowerContent.indexOf(token);
		if (idx >= 0 && (bestIdx < 0 || idx < bestIdx)) {
			bestIdx = idx;
		}
	}

	if (bestIdx < 0) {
		return content.slice(0, 300).replace(/\n+/g, " ").trim();
	}

	// Extract window around the match
	const words = content.replace(/\n+/g, " ").split(/\s+/);
	const targetWordIdx = content.slice(0, bestIdx).split(/\s+/).length;
	const start = Math.max(0, targetWordIdx - Math.floor(contextWords / 2));
	const end = Math.min(words.length, targetWordIdx + Math.floor(contextWords / 2));

	let snippet = words.slice(start, end).join(" ");
	if (start > 0) snippet = "... " + snippet;
	if (end < words.length) snippet = snippet + " ...";

	return snippet;
}
