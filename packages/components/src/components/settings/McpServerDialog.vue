<script setup lang="ts">
import { Plus, Trash2 } from "@lucide/vue"
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue"
import { useI18n } from "vue-i18n"
import type { McpServerConfig, McpServerInput } from "@deskfleet/client/mcp-servers"

const props = defineProps<{ initial?: McpServerConfig; disabled?: boolean; save(server: McpServerInput): Promise<void> }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const dialog = useTemplateRef<HTMLDialogElement>("dialog")
const name = ref(props.initial?.name ?? "")
const enabled = ref(props.initial?.enabled ?? true)
const transport = ref<McpServerInput["transport"]>(props.initial?.transport ?? "stdio")
const command = ref(props.initial?.transport === "stdio" ? props.initial.command : "")
const args = ref(props.initial?.transport === "stdio" ? [...props.initial.args] : [])
const url = ref(props.initial && props.initial.transport !== "stdio" ? props.initial.url : "")
interface Pair { key: string; value: string }
const pairs = (values: Record<string, string>): Pair[] => Object.entries(values).map(([key, value]) => ({ key, value }))
const env = ref<Pair[]>(props.initial?.transport === "stdio" ? pairs(props.initial.env) : [])
const headers = ref<Pair[]>(props.initial && props.initial.transport !== "stdio" ? pairs(props.initial.headers) : [])
const entries = computed(() => transport.value === "stdio" ? env.value : headers.value)
const saving = ref(false)
const error = ref<string>()
const blocked = computed(() => saving.value || props.disabled)
const valid = computed(() => name.value.trim() && name.value.trim().toLowerCase() !== "deskfleet"
  && (transport.value === "stdio" ? command.value.trim() : url.value.trim())
  && entries.value.every(entry => entry.key.trim()))
let disposed = false
onMounted(() => dialog.value?.showModal())
onBeforeUnmount(() => { disposed = true })
function close(): void { if (!saving.value) emit("close") }
function settings(): Record<string, string> {
  const keys = entries.value.map(entry => transport.value === "stdio" ? entry.key.trim() : entry.key.trim().toLowerCase())
  if (new Set(keys).size !== keys.length) throw new Error(t("mcpServers.duplicateKey"))
  return Object.fromEntries(entries.value.map(entry => [entry.key.trim(), entry.value]))
}
async function submit(): Promise<void> {
  if (blocked.value || !valid.value) return
  error.value = undefined
  try {
    const common = { name: name.value.trim(), enabled: enabled.value }
    const input: McpServerInput = transport.value === "stdio"
      ? { ...common, transport: "stdio", command: command.value.trim(), args: [...args.value], env: settings() }
      : { ...common, transport: transport.value, url: url.value.trim(), headers: settings() }
    saving.value = true
    await props.save(input)
    if (!disposed) emit("close")
  } catch (reason) { if (!disposed) error.value = reason instanceof Error ? reason.message : String(reason) }
  finally { if (!disposed) saving.value = false }
}
</script>

<template>
  <dialog ref="dialog" class="ui-dialog app-no-drag w-[36rem]" :aria-label="t(initial ? 'mcpServers.edit' : 'mcpServers.add')" @cancel.prevent="close">
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <h2 class="ui-dialog-title">{{ t(initial ? 'mcpServers.edit' : 'mcpServers.add') }}</h2>
      <label class="flex flex-col gap-1.5 text-sm">{{ t('mcpServers.name') }}<input v-model="name" name="mcp-name" class="ui-input" maxlength="128" required autofocus :disabled="blocked" autocomplete="off" /></label>
      <label class="flex flex-col gap-1.5 text-sm">{{ t('mcpServers.transport') }}
        <select v-model="transport" name="mcp-transport" class="ui-input" :disabled="blocked"><option value="stdio">stdio</option><option value="http">Streamable HTTP</option><option value="sse">SSE</option></select>
      </label>
      <template v-if="transport === 'stdio'">
        <label class="flex flex-col gap-1.5 text-sm">{{ t('mcpServers.command') }}<input v-model="command" name="mcp-command" class="ui-input font-mono text-xs" required :disabled="blocked" autocomplete="off" :spellcheck="false" /><span class="text-xs text-ui-text-muted">{{ t('mcpServers.commandHint') }}</span></label>
        <div class="flex flex-col gap-2" role="group" :aria-label="t('mcpServers.arguments')">
          <div class="flex items-center justify-between gap-3"><span class="text-sm">{{ t('mcpServers.arguments') }}</span><button type="button" class="ui-text-button cursor-pointer hover:bg-ui-hover disabled:op-50" data-mcp-add-arg :disabled="blocked" @click="args.push('')"><Plus :size="13" aria-hidden="true" />{{ t('mcpServers.addArgument') }}</button></div>
          <div v-for="(_, index) in args" :key="index" class="flex gap-2">
            <input v-model="args[index]" :name="`mcp-argument-${index}`" :aria-label="t('mcpServers.argumentNumber', { n: index + 1 })" class="ui-input font-mono text-xs" :disabled="blocked" autocomplete="off" :spellcheck="false" />
            <button type="button" class="ui-button px-2" :aria-label="t('mcpServers.removeArgument', { n: index + 1 })" :disabled="blocked" @click="args.splice(index, 1)"><Trash2 :size="14" aria-hidden="true" /></button>
          </div>
        </div>
      </template>
      <label v-else class="flex flex-col gap-1.5 text-sm">{{ t('mcpServers.url') }}<input v-model="url" name="mcp-url" class="ui-input font-mono text-xs" type="url" required :disabled="blocked" autocomplete="off" :spellcheck="false" placeholder="https://example.com/mcp" /></label>
      <div class="flex flex-col gap-2" role="group" :aria-label="t(transport === 'stdio' ? 'mcpServers.environment' : 'mcpServers.headers')">
        <div class="flex items-center justify-between gap-3"><span class="text-sm">{{ t(transport === 'stdio' ? 'mcpServers.environment' : 'mcpServers.headers') }}</span><button type="button" class="ui-text-button cursor-pointer hover:bg-ui-hover disabled:op-50" data-mcp-add-pair :disabled="blocked" @click="entries.push({ key: '', value: '' })"><Plus :size="13" aria-hidden="true" />{{ t('mcpServers.addEntry') }}</button></div>
        <div v-for="(entry, index) in entries" :key="index" class="flex gap-2">
          <input v-model="entry.key" :name="`mcp-key-${index}`" :aria-label="t('mcpServers.keyNumber', { n: index + 1 })" :placeholder="t('mcpServers.key')" class="ui-input flex-1 font-mono text-xs" required :disabled="blocked" autocomplete="off" :spellcheck="false" />
          <input v-model="entry.value" :name="`mcp-value-${index}`" :aria-label="t('mcpServers.valueNumber', { n: index + 1 })" :placeholder="t('mcpServers.value')" class="ui-input flex-[1.4] font-mono text-xs" :disabled="blocked" autocomplete="off" :spellcheck="false" />
          <button type="button" class="ui-button px-2" :aria-label="t('mcpServers.removeEntry', { n: index + 1 })" :disabled="blocked" @click="entries.splice(index, 1)"><Trash2 :size="14" aria-hidden="true" /></button>
        </div>
      </div>
      <label class="flex items-center gap-2 text-sm"><input v-model="enabled" name="mcp-enabled" type="checkbox" :disabled="blocked" />{{ t('mcpServers.enabled') }}</label>
      <p class="m-0 text-xs leading-5 text-ui-text-muted">{{ t('mcpServers.appliesNext') }}</p>
      <p v-if="error" role="alert" class="m-0 text-sm text-ui-danger">{{ error }}</p>
      <div class="ui-dialog-actions mt-1"><button type="button" class="ui-button" :disabled="saving" @click="close">{{ t('catalog.cancel') }}</button><button type="submit" data-mcp-save class="ui-button-primary" :disabled="blocked || !valid">{{ t(saving ? 'catalog.saving' : 'catalog.save') }}</button></div>
    </form>
  </dialog>
</template>
