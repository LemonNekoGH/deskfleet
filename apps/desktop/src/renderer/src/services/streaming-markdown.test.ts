import { expect, test, vi } from "vitest"
import { renderMarkdown } from "./markdown.ts"
import { createStreamingMarkdownRenderer } from "./streaming-markdown.ts"

function parse(html: string) {
  const element = document.createElement("div")
  element.innerHTML = html
  return element
}
function fades(element: HTMLElement) {
  return [...element.querySelectorAll<HTMLElement>(".ui-stream-fade")].map(span => ({
    text: span.textContent,
    delay: span.style.animationDelay,
  }))
}

test("rapid chunks preserve fade progress and leave settled text fully visible", () => {
  const clock = vi.spyOn(performance, "now").mockReturnValue(0)
  const render = createStreamingMarkdownRenderer()
  expect(fades(parse(render("Hello", true)))).toEqual([{ text: "Hello", delay: "0ms" }])

  clock.mockReturnValue(40)
  const second = parse(render("Hello **world**", true))
  expect(fades(second)).toEqual([{ text: "Hello", delay: "-40ms" }, { text: " ", delay: "0ms" }, { text: "world", delay: "0ms" }])
  expect(second.querySelector("strong")?.textContent).toBe("world")

  clock.mockReturnValue(170)
  const third = parse(render("Hello **world**!", true))
  expect(fades(third)).toEqual([{ text: " ", delay: "-130ms" }, { text: "world", delay: "-130ms" }, { text: "!", delay: "0ms" }])
  expect(third.textContent).toBe("Hello world!\n")

  clock.mockReturnValue(400)
  expect(render("Hello **world**!", true)).toBe(renderMarkdown("Hello **world**!"))
})

test("closing Markdown syntax does not fade existing text again", () => {
  vi.spyOn(performance, "now").mockReturnValue(0)
  const render = createStreamingMarkdownRenderer()
  render("Start **bold", true)
  const closed = parse(render("Start **bold**", true))
  expect(closed.querySelector("strong")?.textContent).toBe("bold")
  expect(fades(closed)).toEqual([])
  expect(fades(parse(render("Start **bold** again", true)))).toEqual([{ text: " again", delay: "0ms" }])
})

test("fade wrappers preserve block structure and escaped text", () => {
  const render = createStreamingMarkdownRenderer()
  const source = "- First\n- Second\n\n```html\n<script>alert(1)</script>\n```\n\n[Link](https://example.com)"
  const output = parse(render(source, true))
  expect(output.querySelectorAll("li")).toHaveLength(2)
  expect(output.querySelector("pre > code")?.textContent).toBe("<script>alert(1)</script>\n")
  expect(output.querySelector("script")).toBeNull()
  expect(output.querySelector("a")?.getAttribute("href")).toBe("https://example.com")
  for (const span of output.querySelectorAll(".ui-stream-fade")) span.replaceWith(...span.childNodes)
  expect(output.innerHTML).toBe(renderMarkdown(source))
})

test("history and completed output render without animation markup", () => {
  const render = createStreamingMarkdownRenderer()
  expect(render("Saved answer", false)).toBe(renderMarkdown("Saved answer"))
  expect(fades(parse(render("New answer", true)))).toHaveLength(1)
  expect(render("New answer", false)).toBe(renderMarkdown("New answer"))
})
