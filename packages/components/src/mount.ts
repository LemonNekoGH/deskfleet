import { createPinia } from "pinia"
import { createApp, vaporInteropPlugin } from "vue"
import { client as platformClient, getClient } from "@deskfleet/client/platform"
import { i18n } from "./i18n/index.ts"
import "./styles.css"

export async function mountDeskfleet(target: string | Element = "#root") {
  document.documentElement.lang = platformClient.locale
  if (window.location.hash.startsWith("#/mermaid")) {
    const params = new URLSearchParams(window.location.hash.split("?")[1])
    const root = (await import("./components/session/MermaidViewer.vue")).default
    const app = createApp(root, {
      code: params.get("code") ?? "",
      mode: "window",
      source: {
        sessionId: params.get("sessionId") || undefined,
        entryId: params.get("entryId") || undefined,
        diagramId: params.get("diagramId") || undefined,
      },
    })
    app.use(vaporInteropPlugin).use(createPinia()).use((await import("./router/index.ts")).router).use(i18n).mount(target)
    return app
  }
  const host = getClient()
  // Account sign-in and the local workspace are separate graphs.
  const root = host.central
    ? (await import("./AccountShell.vue")).default
    : (await import("./App.vue")).default
  const app = host.central ? createApp(root, { host: { ...host } }) : createApp(root)
  app.use(vaporInteropPlugin)
  app.use(createPinia())
  if (!host.central) app.use((await import("./router/index.ts")).router)
  app.use(i18n)
  app.mount(target)
  return app
}
