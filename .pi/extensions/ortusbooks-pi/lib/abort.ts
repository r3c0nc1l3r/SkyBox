/**
 * Create a combined AbortSignal from an optional parent signal and a timeout.
 * Uses AbortSignal.any() (Node.js 20+) for proper cleanup.
 */
export function makeAbortSignal(
	parentSignal: AbortSignal | undefined,
	timeoutMs: number,
): AbortSignal {
	const timeout = AbortSignal.timeout(timeoutMs);
	if (!parentSignal) return timeout;
	if (typeof AbortSignal.any === "function") {
		return AbortSignal.any([parentSignal, timeout]);
	}
	// Fallback for older runtimes
	const controller = new AbortController();
	const onAbort = () => controller.abort();
	parentSignal.addEventListener("abort", onAbort, { once: true });
	timeout.addEventListener("abort", onAbort, { once: true });
	return controller.signal;
}
