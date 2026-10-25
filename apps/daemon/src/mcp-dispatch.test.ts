import assert from "node:assert/strict"
import test from "node:test"
import type { MachineOperations } from "./machine-operations.ts"
import { dispatchMcp } from "./mcp-dispatch.ts"

const actor = { kind: "user" as const, userId: "creator", deviceId: "login" }
const scope = { sessionId: "1", workspaceId: "10" }

function fixture() {
  const calls: unknown[] = []
  const tasks = [{ id: "a", workspaceId: "10" }, { id: "b", workspaceId: "20" }]
  const sessions = [{ id: "1", workspaceId: "10" }, { id: "2", workspaceId: "20" }]
  const operations = {
    agents: {
      requireActive: async () => ({ session: sessions[0] }),
      journal: { list: async () => sessions, read: async (id: string) => ({ session: sessions.find(session => session.id === id)! }) },
      handle: async (...args: unknown[]) => { calls.push(args); return "history" },
    },
    catalog: { native: { snapshot: async () => ({ workspaces: [{ id: "10" }, { id: "20" }] }) } },
    providers: { metadata: () => ({ providers: [{ id: "codex", name: "Codex" }] }) },
    handle: async (method: string, ...args: unknown[]) => {
      if (method === "scheduleList") return tasks
      calls.push([method, ...args]); return "accepted"
    },
  } as unknown as MachineOperations
  return { calls, operations }
}

test("MCP discovery filters Workspace resources and never exposes provider launch secrets", async () => {
  const { operations } = fixture()
  assert.deepEqual(await dispatchMcp(operations, "catalogList", {}, actor, scope), { sessionId: "1", workspaceId: "10", workspaces: [{ id: "10" }] })
  assert.deepEqual(await dispatchMcp(operations, "_deskfleet/session/list", {}, actor, scope), [{ id: "1", workspaceId: "10" }])
  assert.deepEqual(await dispatchMcp(operations, "scheduleList", {}, actor, scope), [{ id: "a", workspaceId: "10" }])
  assert.deepEqual(await dispatchMcp(operations, "providerList", {}, actor, scope), { providers: [{ id: "codex", name: "Codex" }] })
})

test("MCP rejects resource IDs and updates outside its issuing Workspace", async () => {
  const { operations, calls } = fixture()
  for (const [method, params] of [
    ["_deskfleet/session/subscribe", { sessionId: "2" }],
    ["_deskfleet/session/history", { sessionId: "2", afterSeq: "0" }],
    ["scheduleCreate", { schedule: { workspaceId: "20" } }],
    ["scheduleDelete", { scheduleId: "b" }],
    ["scheduleRun", { scheduleId: "b" }],
    ["scheduleUpdate", { scheduleId: "a", changes: { workspaceId: "20" } }],
    ["workspaceDelete", { workspaceId: "10" }],
  ] as const) await assert.rejects(dispatchMcp(operations, method, params, actor, scope), /outside|unavailable/)
  assert.deepEqual(calls, [])
  assert.equal(await dispatchMcp(operations, "scheduleUpdate", { scheduleId: "a", changes: { enabled: false } }, actor, scope), "accepted")
  assert.deepEqual(calls[0], ["scheduleUpdate", { scheduleId: "a", changes: { enabled: false } }, actor])
  await dispatchMcp(operations, "scheduleCreate", { schedule: { title: "Review changes" } }, actor, scope)
  assert.deepEqual(calls[1], ["scheduleCreate", { schedule: { title: "Review changes", workspaceId: "10" } }, actor])
})

test("an archived issuing Session cannot use a retained MCP grant", async () => {
  const { operations, calls } = fixture()
  operations.agents.requireActive = async () => { throw new Error("Session is archived") }
  await assert.rejects(dispatchMcp(operations, "scheduleRun", { scheduleId: "a" }, actor, scope), /archived/)
  assert.deepEqual(calls, [])
})
