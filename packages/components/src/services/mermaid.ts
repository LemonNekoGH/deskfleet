type MermaidModule = typeof import("mermaid").default

let mermaidPromise: Promise<MermaidModule> | undefined
let renderSequence = 0

function loadMermaid(): Promise<MermaidModule> {
  mermaidPromise ??= import("mermaid").then(module => module.default)
  return mermaidPromise
}

export async function renderMermaidDiagram(code: string, dark: boolean): Promise<string> {
  const mermaid = await loadMermaid()
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: dark ? "dark" : "default",
    suppressErrorRendering: true,
  })
  const id = `deskfleet-mermaid-${++renderSequence}`
  const { svg } = await mermaid.render(id, code)
  return svg
}
