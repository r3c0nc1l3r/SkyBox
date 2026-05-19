#!/usr/bin/env -S npx tsx
/**
 * Seed script: ingests curated BoxLang docs into the boxdox worker.
 *
 * Usage:
 *   export BOXDOX_URL="https://skybox-boxdox.codetek.us"
 *   npx tsx scripts/seed.ts
 */

const BASE_URL = process.env.BOXDOX_URL || 'https://skybox-boxdox.codetek.us';
const CONTENT_DIR = process.env.BOXDOX_CONTENT || '/home/k/Git/BoxLang/box-dox/content';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '5', 10);

const DOCS = [
  'boxlang-language/variables.md',
  'boxlang-language/variable-scopes.md',
  'boxlang-language/program-structure.md',
  'boxlang-language/comments.md',
  'boxlang-language/conditionals.md',
  'boxlang-language/operators.md',
  'boxlang-language/numbers.md',
  'boxlang-language/strings.md',
  'boxlang-language/arrays.md',
  'boxlang-language/structures.md',
  'boxlang-language/closures.md',
  'boxlang-language/queries.md',
  'boxlang-language/json.md',
  'boxlang-language/xml.md',
  'boxlang-language/exception-management.md',
  'boxlang-language/locking.md',
  'boxlang-language/syntax.md',
  'boxlang-language/syntax/destructuring.md',
  'boxlang-language/syntax/spread-syntax.md',
  'boxlang-language/syntax/lambdas.md',
  'boxlang-language/templating-language.md',
  'boxlang-language/classes/README.md',
  'boxlang-language/classes/functions.md',
  'boxlang-language/classes/annotations.md',
  'boxlang-language/classes/interfaces.md',
  'boxlang-language/classes/properties.md',
  'boxlang-framework/applicationbx.md',
  'boxlang-framework/getting-started.md',
  'boxlang-framework/components.md',
  'boxlang-framework/file-handling.md',
  'boxlang-framework/http-calls.md',
  'boxlang-framework/java-integration.md',
  'boxlang-framework/logging.md',
  'boxlang-framework/property-files.md',
  'boxlang-framework/jdbc/README.md',
  'boxlang-framework/jdbc/querying.md',
  'boxlang-framework/jdbc/transactions.md',
  'boxlang-language/datasources.md',
  'boxlang-framework/asynchronous-programming/README.md',
  'boxlang-framework/asynchronous-programming/box-futures.md',
  'boxlang-framework/asynchronous-programming/executors.md',
  'boxlang-framework/asynchronous-programming/scheduled-tasks.md',
  'boxlang-framework/caching/README.md',
  'boxlang-framework/interceptors/README.md',
  'boxlang-framework/modularity/README.md',
  'boxlang-framework/matchbox/README.md',
  'getting-started/overview/README.md',
  'getting-started/configuration.md',
  'extra-credit/testing.md',
  'files.md',
];

async function ingestOne(filePath) {
  const fs = await import('fs');
  const path = await import('path');
  const fullPath = path.join(CONTENT_DIR, filePath);
  if (!fs.existsSync(fullPath)) return { filePath, ok: false, error: 'not found' };
  const content = fs.readFileSync(fullPath, 'utf-8');

  const resp = await fetch(`${BASE_URL}/api/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, content }),
  });
  const result = await resp.json();

  if (result.status === 'ok') {
    return { filePath, ok: true, chunks: result.chunkCount, total: result.totalChunks, skipped: result.totalChunks - result.chunkCount };
  }
  return { filePath, ok: false, error: result.error || JSON.stringify(result) };
}

async function main() {
  console.log(`Ingesting ${DOCS.length} docs (concurrency: ${CONCURRENCY})...\n`);

  let success = 0, failed = 0;
  const queue = [...DOCS];
  const t0 = Date.now();

  while (queue.length > 0) {
    const batch = queue.splice(0, CONCURRENCY);
    const results = await Promise.all(batch.map(ingestOne));
    for (const r of results) {
      if (r.ok) {
        const extra = r.skipped > 0 ? ` (${r.skipped} skipped)` : '';
        console.log(`  OK  ${r.filePath} → ${r.chunks} chunks${extra}`);
        success++;
      } else {
        console.error(`  ERR ${r.filePath}: ${r.error}`);
        failed++;
      }
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s. ${success} succeeded, ${failed} failed`);
}

main().catch(console.error);
