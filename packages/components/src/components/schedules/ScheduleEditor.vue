<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import type { ScheduleInput, ScheduledTask } from "@deskfleet/client/schedules"
import type { AgentSessionContext } from "../../../../../apps/daemon/src/agent-protocol.ts"
import { useFleetStore } from "../../stores/fleet.ts"
import { useAgentSessionsStore, type AgentSelection } from "../../stores/agent-sessions.ts"
import { useProvidersStore } from "../../stores/providers.ts"
import AgentConfigurationSelector from "../composer/AgentConfigurationSelector.vue"
import ScheduleTiming from "./ScheduleTiming.vue"

const props = defineProps<{
  initial?: ScheduledTask
  disabled?: boolean
  save(schedule: ScheduleInput): Promise<ScheduledTask>
}>()
const emit = defineEmits<{ saved: [schedule: ScheduledTask]; busy: [value: boolean] }>()
const { t } = useI18n()
const fleet = useFleetStore()
const agents = useAgentSessionsStore()
const providers = useProvidersStore()
const title = ref(props.initial?.title ?? "")
const prompt = ref(props.initial?.prompt ?? "")
const workspaceId = ref(props.initial?.workspaceId ?? fleet.targetWorkspaceId ?? fleet.machines[0]?.workspaces[0]?.id ?? "")
const targetKind = ref<"new" | "existing">(props.initial?.target.kind ?? "new")
const sessionId = ref(props.initial?.target.kind === "existing" ? props.initial.target.sessionId : "")
const providerId = ref(props.initial?.target.kind === "new" ? props.initial.target.provider : providers.selectedId)
const selection = ref<AgentSelection>(props.initial?.target.kind === "new"
  ? { provider: props.initial.target.provider, ...props.initial.target.configuration }
  : { ...agents.draftConfiguration })
const context = ref<AgentSessionContext>(props.initial?.target.kind === "new" ? props.initial.target.context : "worktree")
const trigger = ref<ScheduleInput["trigger"]>(JSON.parse(JSON.stringify(props.initial?.trigger ?? { kind: "daily", time: "09:00", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })))
const enabled = ref(props.initial?.enabled ?? true)
const saving = ref(false)
const configurationLoading = ref(false)
const error = ref<string>()
let disposed = false
onBeforeUnmount(() => { disposed = true })
const workspaces = computed(() => fleet.machines[0]?.workspaces ?? [])
const workspace = computed(() => workspaces.value.find(value => value.id === workspaceId.value))
const sessions = computed(() => Object.values(agents.sessions).filter(session => session.workspaceId === workspaceId.value && session.archiveState === "active" && session.lifecycle === "ready"))
const selectedSession = computed(() => sessions.value.find(session => session.id === sessionId.value))
const sessionProvider = computed(() => providers.providers.find(provider => provider.id === selectedSession.value?.provider)?.name ?? selectedSession.value?.provider)
const selectedProvider = computed(() => providers.providers.find(provider => provider.id === providerId.value))
const blocked = computed(() => props.disabled || saving.value)
const canSave = computed(() => !blocked.value && !!title.value.trim() && !!prompt.value.trim() && !!workspace.value
  && (targetKind.value === "existing" ? !!selectedSession.value : providers.ready && !!selectedProvider.value && !configurationLoading.value)
  && (trigger.value.kind !== "weekly" || trigger.value.weekdays.length > 0))
watch(workspaceId, () => { sessionId.value = "" })
watch(() => providers.selectedId, value => { if (!providerId.value) providerId.value = value })
watch(() => props.initial?.enabled, value => { if (value !== undefined) enabled.value = value })
watch(saving, value => emit("busy", value))

async function submit(): Promise<void> {
  if (!canSave.value) return
  error.value = undefined
  if (trigger.value.kind === "daily" || trigger.value.kind === "weekly") {
    try { new Intl.DateTimeFormat("en", { timeZone: trigger.value.timeZone }) }
    catch { error.value = t("schedules.invalidTimeZone"); return }
  }
  const choices = selection.value.provider === providerId.value ? selection.value : undefined
  const configuration = choices ? { model: choices.model, reasoningEffort: choices.reasoningEffort, mode: choices.mode } : undefined
  const schedule: ScheduleInput = {
    title: title.value.trim(), prompt: prompt.value.trim(), workspaceId: workspaceId.value, enabled: enabled.value,
    target: targetKind.value === "existing" ? { kind: "existing", sessionId: sessionId.value }
      : { kind: "new", provider: providerId.value, context: context.value, ...(configuration && { configuration }) },
    trigger: JSON.parse(JSON.stringify(trigger.value)) as ScheduleInput["trigger"],
  }
  saving.value = true
  try {
    const saved = await props.save(schedule)
    if (!disposed) emit("saved", saved)
  } catch (reason) {
    if (!disposed) error.value = reason instanceof Error ? reason.message : String(reason)
  } finally { if (!disposed) saving.value = false }
}
</script>

<template>
  <form class="flex flex-col gap-5" @submit.prevent="submit">
    <div class="rounded-2xl border border-ui-border bg-ui-surface px-4 pt-4 shadow-ui-card focus-within:border-ui-accent/60">
      <input v-model="title" name="schedule-title" class="block w-full border-b border-ui-border bg-transparent pb-3 text-lg font-semibold outline-none" :aria-label="t('schedules.name')" :placeholder="t('schedules.nameHint')" maxlength="200" required :disabled="blocked" />
      <textarea v-model="prompt" name="schedule-prompt" class="mt-3 block min-h-34 w-full resize-y bg-transparent text-[15px] leading-6 outline-none" :aria-label="t('schedules.prompt')" :placeholder="t('schedules.promptHint')" required :disabled="blocked" />
      <div class="flex min-h-11 items-center pb-2">
        <AgentConfigurationSelector v-if="targetKind === 'new'" v-model:provider-id="providerId" v-model:selection="selection" :workspace-id="workspaceId || undefined" :disabled="blocked" @loading="configurationLoading = $event" />
        <span v-else class="text-sm text-ui-text-muted">{{ sessionProvider ?? t('schedules.existingConfiguration') }}</span>
      </div>
    </div>
    <div class="flex flex-wrap gap-3">
      <label class="flex min-w-0 flex-1 flex-col gap-1.5 text-xs text-ui-text-muted">
        {{ t('schedules.workspace') }}
        <select v-model="workspaceId" name="schedule-workspace" class="ui-input min-w-36 text-sm text-ui-text" required :disabled="blocked || !!initial">
          <option value="" disabled>{{ t('schedules.chooseWorkspace') }}</option>
          <option v-if="workspaceId && !workspace" :value="workspaceId" disabled>{{ t('schedules.unavailableWorkspace') }}</option>
          <option v-for="value in workspaces" :key="value.id" :value="value.id">{{ value.name }}</option>
        </select>
      </label>
      <label v-if="targetKind === 'new'" class="flex min-w-0 flex-1 flex-col gap-1.5 text-xs text-ui-text-muted">
        {{ t('composer.context') }}
        <select v-model="context" name="schedule-context" class="ui-input min-w-36 text-sm text-ui-text" :disabled="blocked">
          <option value="worktree">{{ t('composer.contextOption.worktree') }}</option>
          <option value="directory">{{ t('composer.contextOption.directory') }}</option>
        </select>
      </label>
    </div>
    <p v-if="!workspaces.length" role="status" class="m-0 text-sm text-ui-text-muted">{{ t('schedules.noWorkspace') }}</p>
    <p v-if="targetKind === 'new' && providers.ready && !selectedProvider" role="status" class="m-0 text-sm text-ui-text-muted">{{ t('schedules.noProvider') }}</p>
    <div class="ui-card overflow-hidden">
      <label class="ui-setting flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span class="text-ui-text-muted">{{ t('schedules.sendTo') }}</span>
        <select v-model="targetKind" name="schedule-target" class="ui-input w-auto" :disabled="blocked">
          <option value="new">{{ t('schedules.newSession') }}</option>
          <option value="existing">{{ t('schedules.existingSession') }}</option>
        </select>
      </label>
      <label v-if="targetKind === 'existing'" class="ui-setting flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span class="text-ui-text-muted">{{ t('schedules.session') }}</span>
        <select v-model="sessionId" name="schedule-session" class="ui-input max-w-full sm:max-w-80" required :disabled="blocked">
          <option value="" disabled>{{ t('schedules.chooseSession') }}</option>
          <option v-if="sessionId && !selectedSession" :value="sessionId" disabled>{{ t('schedules.unavailableSession') }}</option>
          <option v-for="session in sessions" :key="session.id" :value="session.id">{{ session.title }}</option>
        </select>
      </label>
    </div>
    <p v-if="targetKind === 'existing'" class="m-0 text-xs text-ui-text-muted">{{ t('schedules.backlogHint') }}</p>
    <ScheduleTiming v-model="trigger" :disabled="blocked" />
    <label class="flex items-center gap-2 text-sm"><input v-model="enabled" name="schedule-enabled" type="checkbox" :disabled="blocked" />{{ t('schedules.enabled') }}</label>
    <p class="m-0 text-xs leading-5 text-ui-text-muted">{{ t('schedules.executionHint') }}</p>
    <p v-if="error" role="alert" class="m-0 text-sm text-ui-danger">{{ error }}</p>
    <div class="flex justify-end border-t border-ui-border pt-5">
      <button type="submit" data-schedule-save class="ui-button-primary" :disabled="!canSave">{{ t(saving ? 'catalog.saving' : 'schedules.save') }}</button>
    </div>
  </form>
</template>
