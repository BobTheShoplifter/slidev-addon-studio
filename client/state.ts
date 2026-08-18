import type { StudioTarget } from './types'
import { useLocalStorage } from '@vueuse/core'
import { ref, shallowRef } from 'vue'

export type PanelId = 'inspect' | 'components' | 'animate' | 'layout' | 'slides' | 'assets'

/** Studio is off until asked for, so a normal `slidev` session is unchanged. */
export const studioOpen = useLocalStorage('slidev-studio:open', false)
export const activePanel = useLocalStorage<PanelId>('slidev-studio:panel', 'inspect')
export const dockWidth = useLocalStorage('slidev-studio:dock-width', 320)

/** Snap a dragged element to the canvas and to its neighbours. Hold Alt to skip. */
export const snapEnabled = useLocalStorage('slidev-studio:snap', true)
export const gridEnabled = useLocalStorage('slidev-studio:grid', false)
export const gridSize = useLocalStorage('slidev-studio:grid-size', 20)
/** Outline every mapped block, so it is obvious what can be selected. */
export const outlineEnabled = useLocalStorage('slidev-studio:outlines', false)

export const selection = shallowRef<StudioTarget | null>(null)
/**
 * The last click landed on the slide but on nothing the editor can trace.
 * Without this the click is simply dropped and the panel keeps saying "click
 * anything", which reads as the editor being broken rather than as that
 * particular thing not being editable.
 */
export const missed = shallowRef(false)
export const hovered = shallowRef<StudioTarget | null>(null)

/** A write is in flight; the UI blocks further edits until it lands. */
export const busy = ref(false)
export const lastError = ref<string | null>(null)

export function reportError(error: unknown) {
  lastError.value = error instanceof Error ? error.message : String(error)
  // eslint-disable-next-line no-console
  console.error('[slidev-studio]', error)
  setTimeout(() => (lastError.value = null), 6000)
}

export function clearSelection() {
  selection.value = null
  hovered.value = null
}

// A single place to look when something in the editor is not behaving: the
// live state is on `window.__studio__` while the dev server is running.
if (typeof window !== 'undefined')
  (window as any).__studio__ = { studioOpen, activePanel, selection, hovered, busy, lastError }
