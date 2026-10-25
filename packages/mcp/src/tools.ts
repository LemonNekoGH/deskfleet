import type { Tool } from "@modelcontextprotocol/sdk/types.js"

const id = { type: "string", minLength: 1 }
const object = (properties: Record<string, object>, required: string[] = []) => ({
  type: "object" as const, properties, required, additionalProperties: false,
})
const configuration = object({ model: id, reasoningEffort: id, mode: id })
const trigger = { oneOf: [
  object({ kind: { const: "manual" } }, ["kind"]),
  object({ kind: { const: "daily" }, time: { type: "string", pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" }, timeZone: id }, ["kind", "time", "timeZone"]),
  object({ kind: { const: "weekly" }, time: { type: "string", pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" }, timeZone: id,
    weekdays: { type: "array", items: { type: "integer", minimum: 0, maximum: 6 }, minItems: 1, uniqueItems: true, description: "Sunday is 0, Saturday is 6." },
  }, ["kind", "time", "timeZone", "weekdays"]),
  object({ kind: { const: "interval" }, minutes: { type: "integer", minimum: 1 } }, ["kind", "minutes"]),
] }
const target = { oneOf: [
  object({ kind: { const: "new" }, provider: id, context: { enum: ["worktree", "directory"] }, configuration }, ["kind", "provider", "context"]),
  object({ kind: { const: "existing" }, sessionId: id }, ["kind", "sessionId"]),
] }
const fields = { title: id, prompt: id, enabled: { type: "boolean" }, target, trigger }

/** The tool surface is independent of an ACP provider and of daemon implementation details. */
export const DESKFLEET_TOOLS: (Tool & { method: string })[] = [
  { name: "deskfleet_context", method: "catalogList", description: "Read this Agent's authorized machine and Workspace context, including available directories.", inputSchema: object({}) },
  { name: "deskfleet_providers", method: "providerList", description: "List available Agent provider identities for creating scheduled tasks on this machine.", inputSchema: object({}) },
  { name: "deskfleet_sessions", method: "_deskfleet/session/list", description: "List Sessions in this Agent's Workspace.", inputSchema: object({}) },
  { name: "deskfleet_session", method: "_deskfleet/session/subscribe", description: "Inspect a Session in this Agent's Workspace, including its latest execution state.", inputSchema: object({ sessionId: id }, ["sessionId"]) },
  { name: "deskfleet_session_history", method: "_deskfleet/session/history", description: "Read a page of a Workspace Session's recorded events. Continue with the last event's seq as afterSeq.", inputSchema: object({ sessionId: id, afterSeq: { type: "string", pattern: "^[0-9]+$" }, limit: { type: "integer", minimum: 1, maximum: 200 } }, ["sessionId", "afterSeq"]) },
  { name: "deskfleet_schedules", method: "scheduleList", description: "List scheduled tasks and recent runs in this Agent's Workspace.", inputSchema: object({}) },
  { name: "deskfleet_schedule_create", method: "scheduleCreate", description: "Create a scheduled task in this Agent's Workspace. Use an explicit IANA time zone for daily or weekly times. New runs create a Session; existing targets append a prompt to that Session.", inputSchema: object({ schedule: object(fields, ["title", "prompt", "enabled", "target", "trigger"]) }, ["schedule"]) },
  { name: "deskfleet_schedule_update", method: "scheduleUpdate", description: "Update a Workspace scheduled task. Set enabled to false to pause it.", inputSchema: object({ scheduleId: id, changes: object(fields) }, ["scheduleId", "changes"]) },
  { name: "deskfleet_schedule_delete", method: "scheduleDelete", description: "Delete a Workspace scheduled task. Existing Sessions and their history remain available.", inputSchema: object({ scheduleId: id }, ["scheduleId"]) },
  { name: "deskfleet_schedule_run", method: "scheduleRun", description: "Run a Workspace scheduled task now, including a manual task.", inputSchema: object({ scheduleId: id }, ["scheduleId"]) },
]
