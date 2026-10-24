import { renderMarkdown } from "./markdown.ts"

const fadeDuration = 160
type Fade = { start: number; end: number; at: number }

/** Keep fade progress across v-html replacements, so fast chunks never restart it. */
export function createStreamingMarkdownRenderer() {
  let previous = ""
  let fades: Fade[] = []

  return (text: string, streaming: boolean): string => {
    const html = renderMarkdown(text)
    if (!streaming) {
      previous = ""
      fades = []
      return html
    }

    const template = document.createElement("template")
    template.innerHTML = html
    // Markdown adds trailing newlines to blocks; these are not new visible text.
    const visible = template.content.textContent!.trimEnd()
    const now = performance.now()
    if (!visible.startsWith(previous)) {
      // Closing Markdown syntax can reformat existing text. Show it immediately.
      fades = []
    } else if (visible.length > previous.length) {
      fades.push({ start: previous.length, end: visible.length, at: now })
    }
    previous = visible
    fades = fades.filter(fade => now - fade.at < fadeDuration)
    if (!fades.length) return html

    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    while (walker.nextNode()) nodes.push(walker.currentNode as Text)
    let offset = 0
    for (const node of nodes) {
      const value = node.data
      const end = offset + value.length
      const active = fades.filter(fade => fade.start < end && fade.end > offset)
      if (active.length) {
        const fragment = document.createDocumentFragment()
        let cursor = 0
        for (const fade of active) {
          const start = Math.max(0, fade.start - offset)
          const stop = Math.min(value.length, fade.end - offset)
          fragment.append(value.slice(cursor, start))
          const span = document.createElement("span")
          span.className = "ui-stream-fade"
          span.style.animationDuration = `${fadeDuration}ms`
          span.style.animationDelay = `${fade.at - now}ms`
          span.textContent = value.slice(start, stop)
          fragment.append(span)
          cursor = stop
        }
        fragment.append(value.slice(cursor))
        node.replaceWith(fragment)
      }
      offset = end
    }
    return template.innerHTML
  }
}
