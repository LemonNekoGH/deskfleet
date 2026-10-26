import type { SystemStatus } from "../../../apps/daemon/src/system-protocol.ts"

export type { SystemStatus } from "../../../apps/daemon/src/system-protocol.ts"

/** Read the selected daemon's machine metrics without creating a media peer. */
export interface SystemApi {
  status(): Promise<SystemStatus>
}
