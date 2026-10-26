import type { SystemStatus as NativeSystemStatus } from "@deskfleet/native"

/** Measurements and installed daemon information from the selected machine. */
export interface SystemStatus extends NativeSystemStatus {
  daemonVersion: string
}

export interface SystemMethods {
  systemStatus: { params: Record<string, never>; result: SystemStatus }
}
