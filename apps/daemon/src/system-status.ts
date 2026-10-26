import { systemStatus } from "@deskfleet/native"
import manifest from "../package.json" with { type: "json" }
import type { SystemStatus } from "./system-protocol.ts"

/** The package version is embedded when bundling either daemon host. */
export async function readSystemStatus(): Promise<SystemStatus> {
  return { ...await systemStatus(), daemonVersion: manifest.version }
}
