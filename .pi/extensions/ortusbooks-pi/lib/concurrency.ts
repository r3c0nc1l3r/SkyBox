/**
 * Concurrency-limited async map.
 * Runs an async function over an array with a configurable concurrency limit.
 * Returns results in input order.
 */
export async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	if (items.length === 0) return [];
	const limit = Math.max(1, Math.min(concurrency, items.length));
	const results: R[] = new Array(items.length);
	let nextIndex = 0;

	const workers = new Array(limit).fill(null).map(async () => {
		while (true) {
			const current = nextIndex++;
			if (current >= items.length) return;
			results[current] = await fn(items[current]);
		}
	});

	await Promise.all(workers);
	return results;
}
