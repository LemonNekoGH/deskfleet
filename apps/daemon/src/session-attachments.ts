import { mkdir, open, realpath, rm } from "node:fs/promises"
import { basename, extname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import type { ContentBlock } from "@agentclientprotocol/sdk/unstable"

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/bmp": ".bmp",
  "image/svg+xml": ".svg",
  "image/vnd.microsoft.icon": ".ico",
}

function safeFileName(raw: string, fallback: string): string {
  const cleaned = basename(raw.replaceAll("\\", "/")).replace(/[\0-\x1f<>:"/\\|?*]+/gu, "_").trim()
  if (!cleaned || cleaned === "." || cleaned === "..") return fallback
  return cleaned.slice(0, 200)
}

function resourceFileName(uri: string): string {
  const pathPart = uri.split(/[?#]/u, 1)[0] ?? ""
  let decoded = pathPart
  try { decoded = decodeURIComponent(pathPart) } catch { /* keep raw */ }
  const candidate = safeFileName(decoded, "pasted-text.txt")
  return extname(candidate) ? candidate : `${candidate}.txt`
}

/** Daemon-managed Session attachment storage outside optional Git worktrees. */
export class SessionAttachments {
  readonly #directory: string

  constructor(directory: string) {
    this.#directory = resolve(directory, "session-attachments")
  }

  #sessionPath(sessionId: string): string {
    if (!/^[1-9][0-9]*$/u.test(sessionId)) throw new Error("Invalid workspace session ID")
    return join(this.#directory, sessionId)
  }

  async directory(sessionId: string): Promise<string> {
    const target = this.#sessionPath(sessionId)
    await mkdir(target, { recursive: true, mode: 0o700 })
    return realpath(target)
  }

  async write(sessionId: string, requestedName: string, data: Uint8Array): Promise<{ path: string; uri: string; name: string; size: number }> {
    const dir = await this.directory(sessionId)
    const clean = safeFileName(requestedName, "attachment")
    const extension = extname(clean)
    const stem = extension ? clean.slice(0, -extension.length) : clean
    for (let index = 0; ; index++) {
      const name = index ? `${stem} (${index})${extension}` : clean
      const path = join(dir, name)
      try {
        const handle = await open(path, "wx", 0o600)
        try {
          let offset = 0
          while (offset < data.byteLength) {
            const { bytesWritten } = await handle.write(data, offset, data.byteLength - offset, offset)
            if (!bytesWritten) throw new Error("Could not write attachment data")
            offset += bytesWritten
          }
        } finally {
          await handle.close()
        }
        return { path, uri: pathToFileURL(path).href, name, size: data.byteLength }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") continue
        throw error
      }
    }
  }

  /** Materialize unsupported inline blocks into `resource_link` files before provider delivery. */
  async preparePrompt(
    sessionId: string,
    content: ContentBlock[],
    capabilities?: { image?: boolean; embeddedContext?: boolean },
  ): Promise<ContentBlock[]> {
    const prepared: ContentBlock[] = []
    for (const block of content) {
      if (block.type === "image" && !capabilities?.image) {
        const extension = IMAGE_EXTENSIONS[block.mimeType.toLowerCase()] ?? ".bin"
        const saved = await this.write(sessionId, `image${extension}`, Buffer.from(block.data, "base64"))
        prepared.push({ type: "resource_link", uri: saved.uri, name: saved.name, mimeType: block.mimeType, size: saved.size })
        continue
      }
      if (block.type === "resource" && "text" in block.resource && !capabilities?.embeddedContext) {
        const saved = await this.write(sessionId, resourceFileName(block.resource.uri), Buffer.from(block.resource.text, "utf8"))
        prepared.push({
          type: "resource_link",
          uri: saved.uri,
          name: saved.name,
          mimeType: block.resource.mimeType ?? "text/plain",
          size: saved.size,
        })
        continue
      }
      prepared.push(block)
    }
    return prepared
  }

  async destroy(sessionId: string): Promise<void> {
    await rm(this.#sessionPath(sessionId), { recursive: true, force: true })
  }
}
