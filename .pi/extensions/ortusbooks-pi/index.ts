/**
 * Ortus Documentation Search — Pi Extension
 *
 * Three-tier architecture:
 *   Skills FTS index (offline, ~241 files) → MCP proxy tools (cached) → Scholar context builder
 *
 * This module is the thin entry point. All business logic lives in injectable
 * service classes under `services/`, wired via tsyringe DI in `core/container.ts`.
 * Tool/command/event registration lives in `providers/`.
 */

import { bootstrapExtension } from "./core/container.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI): void {
	bootstrapExtension(pi);
}
