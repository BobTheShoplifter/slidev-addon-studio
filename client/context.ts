import type { InjectionKey } from 'vue'
import type { SourceRange } from './types'
import type { useSlideCanvas } from './composables/useSlideCanvas'
import type { useTransformGizmo } from './composables/useTransformGizmo'
import { inject, shallowRef } from 'vue'

/**
 * Everything a panel needs, assembled once in `StudioRoot` and provided down.
 * Panels stay presentational: they read the current slide and call `commit`,
 * they never talk to the dev server themselves.
 */
export interface StudioContext {
  no: () => number
  content: () => string
  frontmatter: () => Record<string, any>
  note: () => string
  canvas: ReturnType<typeof useSlideCanvas>
  gizmo: ReturnType<typeof useTransformGizmo>
  /**
   * Writes new Markdown for the current slide and restores the selection.
   * `skipHmr` leaves the rendered slide alone for a change the caller has
   * already painted; `keepSelection` then avoids re-finding an element that
   * never went away.
   */
  commit: (content: string, label: string, options?: { skipHmr?: boolean, keepSelection?: boolean }) => Promise<void>
  setFrontmatter: (values: Record<string, any>, label: string) => Promise<void>
  setNote: (note: string) => Promise<void>
  /** Range of the current selection, or `null` when nothing is selected. */
  range: () => SourceRange | null
  /** Selects a block that was just inserted, so it can be configured at once. */
  selectInserted: (tag?: string) => Promise<void>
  /**
   * Selects whatever is under a point, looking through the editor's own chrome.
   * A press on the selection overlay that turns out to be a click rather than a
   * drag uses this, so clicking again reaches what lies underneath.
   */
  selectThrough: (x: number, y: number) => void
  go: (no: number) => void
}

export const studioKey = Symbol('slidev-studio') as InjectionKey<StudioContext>

/**
 * The same context, reachable from outside the component tree.
 *
 * Slidev's setup files, the context menu among them, run before and outside any
 * component, so `inject` is not available to them. `StudioRoot` fills this in
 * while it is mounted and empties it when it is not, which is also how a caller
 * can tell whether there is an editor to talk to at all.
 */
export const studioContext = shallowRef<StudioContext | null>(null)

export function useStudio(): StudioContext {
  const context = inject(studioKey)
  if (!context)
    throw new Error('[slidev-studio] Studio panels must be rendered inside StudioRoot')
  return context
}
