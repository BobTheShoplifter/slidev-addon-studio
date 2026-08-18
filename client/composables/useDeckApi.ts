import type { StudioAsset } from '../types'
import { busy, reportError } from '../state'

/**
 * The dev-only endpoints Studio adds on top of Slidev's own.
 *
 * Slidev can patch a slide, but not add, remove or reorder one, and it has no
 * notion of dropping a file into `public/`. These are served by the addon's
 * Vite plugin and rewrite the Markdown file directly; the file watcher then
 * pushes the result back to the browser like any other edit.
 */

const BASE = '/@studio/'

async function request<T>(route: string, init?: RequestInit): Promise<T | null> {
  busy.value = true
  try {
    const response = await fetch(BASE + route, init)
    const body = await response.json()
    if (!response.ok || body?.error)
      throw new Error(body?.error ?? `Request failed with ${response.status}`)
    return body as T
  }
  catch (error) {
    reportError(error)
    return null
  }
  finally {
    busy.value = false
  }
}

function post<T>(route: string, payload: unknown) {
  return request<T>(route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export interface DeckResult {
  ok: true
  no: number
  total: number
}

export const deckApi = {
  insert: (after: number, content?: string, frontmatter?: string) =>
    post<DeckResult>('deck', { action: 'insert', after, content, frontmatter }),
  duplicate: (no: number) => post<DeckResult>('deck', { action: 'duplicate', no }),
  remove: (no: number) => post<DeckResult>('deck', { action: 'remove', no }),
  move: (no: number, to: number) => post<DeckResult>('deck', { action: 'move', no, to }),
}

/**
 * Rebuilds the slide modules. Needed after a change Slidev bakes in at compile
 * time, above all the slide's layout.
 */
export function requestReload() {
  return post<{ ok: true }>('reload', {})
}

export const assetApi = {
  list: () => request<{ assets: StudioAsset[], root: string }>('assets'),
  upload: (name: string, data: string, dir?: string) => post<StudioAsset>('assets', { name, data, dir }),
}

/** Reads a dropped file as base64 for the upload endpoint. */
export function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
