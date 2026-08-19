import type { InjectionKey } from 'vue'
import type { SourceRange } from './types'
import type { useSlideCanvas } from './composables/useSlideCanvas'
import type { useTransformGizmo } from './composables/useTransformGizmo'
import { inject } from 'vue'

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
  go: (no: number) => void
}

export const studioKey = Symbol('slidev-studio') as InjectionKey<StudioContext>

export function useStudio(): StudioContext {
  const context = inject(studioKey)
  if (!context)
    throw new Error('[slidev-studio] Studio panels must be rendered inside StudioRoot')
  return context
}
