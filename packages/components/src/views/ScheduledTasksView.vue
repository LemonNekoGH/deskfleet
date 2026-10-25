<script setup lang="ts">
import { CalendarClock, Pause, Play, Plus, RefreshCw, Trash2 } from "@lucide/vue"
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import { RouterLink } from "vue-router"
import { schedulesClient, type ScheduleInput, type ScheduleRun, type ScheduledTask } from "@deskfleet/client/schedules"
import PaneHeader from "../components/chrome/PaneHeader.vue"
import ConfirmDialog from "../components/common/ConfirmDialog.vue"
import ScheduleEditor from "../components/schedules/ScheduleEditor.vue"
import { useAccountSession } from "../composables/useAccountSession.ts"
import { useFleetStore } from "../stores/fleet.ts"

const { t, locale } = useI18n()
const account = useAccountSession()
const fleet = useFleetStore()
const api = account && schedulesClient(account.central, fleet.targetId)
const online = computed(() => !!api && (account?.machine.value?.online ?? fleet.localDesktopTarget.online))
const tasks = ref<ScheduledTask[]>([])
const loaded = ref(false)
const loading = ref(false)
const pending = ref(false)
const error = ref<string>()
const editorId = ref<string | null>(null)
const editorVersion = ref(0)
const selected = computed(() => tasks.value.find(task => task.id === editorId.value))
const removing = ref<ScheduledTask>()
let revision = 0
let disposed = false

function date(value?: string, timeZone?: string): string {
  if (!value) return t("schedules.notScheduled")
  return new Intl.DateTimeFormat(locale.value, { dateStyle: "medium", timeStyle: "short", ...(timeZone && { timeZone }) }).format(new Date(value))
}
const zone = (task: ScheduledTask) => "timeZone" in task.trigger ? task.trigger.timeZone : undefined
function select(id: string | null): void {
  if (pending.value) return
  editorId.value = id
  editorVersion.value++
  error.value = undefined
}
async function refresh(): Promise<void> {
  const request = ++revision
  if (!online.value || !api) { loading.value = false; return }
  loading.value = true
  try {
    const result = await api.list()
    if (disposed || request !== revision) return
    tasks.value = result
    loaded.value = true
    error.value = undefined
    if (editorId.value && !result.some(task => task.id === editorId.value)) select(null)
  } catch (reason) {
    if (!disposed && request === revision) error.value = reason instanceof Error ? reason.message : String(reason)
  } finally { if (!disposed && request === revision) loading.value = false }
}
function replace(task: ScheduledTask): void {
  const index = tasks.value.findIndex(value => value.id === task.id)
  if (index < 0) tasks.value.unshift(task)
  else tasks.value[index] = task
}
async function mutate<T>(work: () => Promise<T>): Promise<T> {
  if (!api || !online.value) throw new Error(t("schedules.offline"))
  if (pending.value) throw new Error(t("schedules.busy"))
  ++revision
  loading.value = false
  pending.value = true
  error.value = undefined
  try { return await work() }
  finally { if (!disposed) pending.value = false }
}
async function save(input: ScheduleInput): Promise<ScheduledTask> {
  const id = editorId.value
  return mutate(async () => {
    const task = id ? await api!.update(id, input) : await api!.create(input)
    if (!disposed) replace(task)
    return task
  })
}
function saved(task: ScheduledTask): void { select(task.id) }
async function action(work: () => Promise<unknown>): Promise<boolean> {
  try { await mutate(work); return true }
  catch (reason) { if (!disposed) error.value = reason instanceof Error ? reason.message : String(reason); return false }
}
async function toggle(task: ScheduledTask): Promise<void> {
  await action(async () => {
    const updated = await api!.update(task.id, { enabled: !task.enabled })
    if (!disposed) replace(updated)
  })
}
async function run(task: ScheduledTask): Promise<void> {
  const accepted = await action(async () => {
    const result: ScheduleRun = await api!.run(task.id)
    if (!disposed) replace({ ...task, lastRun: result, runs: [result, ...task.runs.filter(run => run.id !== result.id)].slice(0, 50) })
  })
  if (accepted && !disposed) await refresh()
}
async function remove(): Promise<void> {
  const task = removing.value
  if (!task) return
  await mutate(async () => {
    await api!.remove(task.id)
    if (!disposed) { tasks.value = tasks.value.filter(value => value.id !== task.id); editorId.value = null; editorVersion.value++ }
  })
}
watch(online, () => { void refresh() }, { immediate: true })
const unsubscribe = account?.central.onEvent(event => {
  if (event.type === "catalogChanged" && event.machineId === fleet.targetId && !pending.value) void refresh()
})
// The visible page follows execution status; switching routes or hiding the window stops reads.
const timer = setInterval(() => { if (!document.hidden && !loading.value && !pending.value) void refresh() }, 15_000)
onBeforeUnmount(() => { disposed = true; revision++; clearInterval(timer); unsubscribe?.() })
</script>

<template>
  <PaneHeader hide-details>{{ t('schedules.title') }}</PaneHeader>
  <div class="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
    <section class="flex shrink-0 flex-col border-b border-ui-border lg:w-64 lg:border-b-0 lg:border-r" :aria-label="t('schedules.list')">
      <div class="flex flex-col gap-3 p-4">
        <label v-if="account" class="flex flex-col gap-1.5 text-xs text-ui-text-muted">
          {{ t('schedules.machine') }}
          <select class="ui-input text-sm text-ui-text" name="schedule-machine" :value="fleet.targetId" :disabled="pending" @change="account.selectMachine(($event.target as HTMLSelectElement).value)">
            <option v-for="machine in account.machines.value" :key="machine.id" :value="machine.id">{{ machine.name }}</option>
          </select>
        </label>
        <div class="flex gap-2">
          <button type="button" data-schedule-new class="ui-button flex-1" :disabled="!online || pending || !loaded" @click="select(null)"><Plus :size="15" aria-hidden="true" />{{ t('schedules.create') }}</button>
          <button type="button" class="ui-button px-2" :aria-label="t('catalog.refresh')" :disabled="!online || loading || pending" @click="refresh"><RefreshCw :size="15" aria-hidden="true" /></button>
        </div>
      </div>
      <p v-if="loading && !loaded" role="status" class="m-0 px-4 pb-4 text-sm text-ui-text-muted">{{ t('schedules.loading') }}</p>
      <p v-else-if="loaded && !tasks.length" class="m-0 px-4 pb-4 text-sm leading-5 text-ui-text-muted">{{ t('schedules.empty') }}</p>
      <div class="max-h-56 overflow-y-auto px-2 pb-3 lg:max-h-none">
        <button v-for="task in tasks" :key="task.id" type="button" :data-schedule-id="task.id" class="mb-1 flex w-full cursor-pointer flex-col gap-1 rounded-lg px-3 py-3 text-left hover:bg-ui-hover disabled:cursor-default" :class="task.id === editorId && 'bg-ui-active'" :aria-current="task.id === editorId ? 'true' : undefined" :disabled="pending" @click="select(task.id)">
          <span class="flex w-full items-center gap-2"><CalendarClock :size="15" class="shrink-0 text-ui-text-muted" aria-hidden="true" /><span class="truncate font-medium">{{ task.title }}</span></span>
          <span class="text-xs text-ui-text-muted">{{ t(task.enabled ? `schedules.trigger.${task.trigger.kind}` : 'schedules.paused') }}</span>
          <span v-if="task.nextRunAt" class="text-xs text-ui-text-muted">{{ date(task.nextRunAt, zone(task)) }}</span>
        </button>
      </div>
    </section>
    <section class="min-w-0 flex-1 px-5 py-5 lg:overflow-y-auto lg:px-8">
      <div class="mx-auto flex max-w-3xl flex-col gap-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h1 class="ui-page-title">{{ t(selected ? 'schedules.edit' : 'schedules.create') }}</h1>
          <div v-if="selected" class="flex flex-wrap gap-2">
            <button type="button" data-schedule-run class="ui-button" :disabled="!online || pending" @click="run(selected)"><Play :size="14" aria-hidden="true" />{{ t('schedules.run') }}</button>
            <button type="button" data-schedule-toggle class="ui-button" :disabled="!online || pending" @click="toggle(selected)"><component :is="selected.enabled ? Pause : Play" :size="14" aria-hidden="true" />{{ t(selected.enabled ? 'schedules.pause' : 'schedules.resume') }}</button>
            <button type="button" data-schedule-delete class="ui-button px-2" :aria-label="t('schedules.delete')" :disabled="!online || pending" @click="removing = selected"><Trash2 :size="14" aria-hidden="true" /></button>
          </div>
        </div>
        <p v-if="!online" role="status" class="m-0 text-sm text-ui-text-muted">{{ t(api ? 'schedules.offline' : 'schedules.signIn') }}</p>
        <p v-if="error" role="alert" class="m-0 text-sm text-ui-danger">{{ error }}</p>
        <ScheduleEditor v-if="loaded" :key="`${editorId}:${editorVersion}`" :initial="selected" :disabled="!online || pending" :save="save" @saved="saved" />
        <template v-if="selected">
          <p class="m-0 text-sm text-ui-text-muted">{{ t('schedules.nextRun') }}: {{ date(selected.nextRunAt, zone(selected)) }}<span v-if="zone(selected)"> · {{ zone(selected) }}</span></p>
          <section v-if="selected.runs.length" class="border-t border-ui-border pt-5" :aria-label="t('schedules.recentRuns')">
            <h2 class="ui-section-title mb-3">{{ t('schedules.recentRuns') }}</h2>
            <ol class="ui-card divide-y divide-ui-border">
              <li v-for="run in selected.runs.slice(0, 10)" :key="run.id" class="flex flex-col gap-2 px-4 py-3">
                <div class="flex flex-wrap items-center gap-2 text-sm"><span class="ui-badge">{{ t(`schedules.runState.${run.state}`) }}</span><time class="text-xs text-ui-text-muted" :datetime="run.startedAt">{{ date(run.startedAt, zone(selected)) }}</time><RouterLink v-if="run.sessionId" :to="{ name: 'session', params: { sessionId: run.sessionId } }" class="ml-auto text-ui-accent hover:underline">{{ t('schedules.openSession') }}</RouterLink></div>
                <p v-if="run.error" class="m-0 break-words text-xs text-ui-danger">{{ run.error }}</p>
              </li>
            </ol>
          </section>
        </template>
      </div>
    </section>
  </div>
  <ConfirmDialog v-if="removing" :title="t('schedules.deleteTitle', { title: removing.title })" :description="t('schedules.deleteHint')" :confirm-label="t('schedules.delete')" :confirm="remove" @close="removing = undefined" />
</template>
