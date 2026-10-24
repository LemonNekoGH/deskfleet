<script setup lang="ts">
import { computed } from "vue"
import { createStreamingMarkdownRenderer } from "../../services/streaming-markdown.ts"
const props = defineProps<{ text: string; streaming?: boolean }>()
const render = createStreamingMarkdownRenderer()
// markdown-it escapes raw HTML, so the rendered output is safe to inject.
const html = computed(() => render(props.text, props.streaming ?? false))
</script>

<template>
  <div class="ui-markdown" v-html="html" />
</template>
