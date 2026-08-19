import type { SlidePatch } from '@slidev/types'
import type { MaybeRefOrGetter } from 'vue'
import { useDynamicSlideInfo } from '@slidev/client/composables/useSlideInfo.ts'
import { computed, ref, toValue } from 'vue'
import { patchFrontmatterRaw } from '../md/frontmatter'
import { busy, reportError } from '../state'

/**
 * The single write path to the deck.
 *
 * Every editor action ends here: it produces new Markdown for the slide and
 * posts it to Slidev's own slide endpoint, the same one the built-in editor
 * and `v-drag` use. The Markdown file stays the source of truth, so anything
 * Studio does is a diff the user can read, revert, or write by hand instead.
 */

type HistoryEntry =
  | { kind: 'content', label: string, no: number, before: string, after: string }
  | { kind: 'frontmatter', label: string, no: number, before: Record<string, any>, after: Record<string, any> }
  | { kind: 'frontmatterRaw', label: string, no: number, before: string, after: string }

const undoStack = ref<HistoryEntry[]>([])
const redoStack = ref<HistoryEntry[]>([])
const HISTORY_LIMIT = 100

export const canUndo = computed(() => undoStack.value.length > 0)
export const canRedo = computed(() => redoStack.value.length > 0)
export const lastAction = computed(() => undoStack.value.at(-1)?.label ?? null)

async function send(no: number, data: SlidePatch) {
  const { update } = useDynamicSlideInfo(no)
  busy.value = true
  try {
    return await update(data)
  }
  catch (error) {
    reportError(error)
  }
  finally {
    busy.value = false
  }
}

function push(entry: HistoryEntry) {
  undoStack.value.push(entry)
  if (undoStack.value.length > HISTORY_LIMIT)
    undoStack.value.shift()
  redoStack.value = []
}

export function useSlideSource(no: MaybeRefOrGetter<number>) {
  const slideNo = computed(() => toValue(no))
  const { info } = useDynamicSlideInfo(slideNo)

  const content = computed(() => info.value?.content ?? '')
  const frontmatter = computed(() => info.value?.frontmatter ?? {})
  const note = computed(() => info.value?.note ?? '')

  /**
   * Replaces the slide body. `skipHmr` is for gestures that already show their
   * own result. A drag paints its position directly, so re-rendering mid-drag
   * would only make it stutter.
   */
  async function setContent(next: string, label: string, options: { skipHmr?: boolean, history?: boolean } = {}) {
    const before = content.value
    if (before === next)
      return
    if (options.history !== false)
      push({ kind: 'content', label, no: slideNo.value, before, after: next })
    await send(slideNo.value, { content: next, skipHmr: options.skipHmr })
  }

  /**
   * Frontmatter is sent as raw text rather than as a patch.
   *
   * A patch updates Slidev's own resolved copy of the deck, so the file watcher
   * then finds nothing changed and never rebuilds the slide. Since the layout
   * is compiled into the slide, switching it that way appeared to do nothing
   * until the server restarted. Sending the raw block is what Slidev's own
   * editor does, and it rebuilds properly.
   *
   * The raw text is edited line by line, so comments and key order survive.
   * Anything a line edit cannot safely rewrite falls back to the patch.
   */
  async function setFrontmatter(values: Record<string, any>, label: string) {
    const currentRaw = info.value?.frontmatterRaw ?? ''
    const { raw, unhandled } = patchFrontmatterRaw(currentRaw, values)

    const handled = Object.fromEntries(Object.entries(values).filter(([key]) => !unhandled.includes(key)))
    if (Object.keys(handled).length) {
      push({ kind: 'frontmatterRaw', label, no: slideNo.value, before: currentRaw, after: raw })
      await send(slideNo.value, { frontmatterRaw: raw })
    }

    if (unhandled.length) {
      const rest = Object.fromEntries(unhandled.map(key => [key, values[key]]))
      const before: Record<string, any> = {}
      for (const key of unhandled)
        before[key] = frontmatter.value[key] ?? null
      push({ kind: 'frontmatter', label, no: slideNo.value, before, after: rest })
      await send(slideNo.value, { frontmatter: rest })
    }
  }

  async function setNote(next: string) {
    await send(slideNo.value, { note: next })
  }

  return { info, content, frontmatter, note, setContent, setFrontmatter, setNote }
}

/**
 * Undo and redo replay whole-slide snapshots rather than inverse operations.
 * Slides are small, and storing the text makes every action undoable without
 * each one having to describe its own inverse.
 */
export function useStudioHistory() {
  async function replay(entry: HistoryEntry, direction: 'before' | 'after') {
    if (entry.kind === 'content')
      await send(entry.no, { content: entry[direction] })
    else if (entry.kind === 'frontmatterRaw')
      await send(entry.no, { frontmatterRaw: entry[direction] })
    else
      await send(entry.no, { frontmatter: entry[direction] })
  }

  async function undo() {
    const entry = undoStack.value.pop()
    if (!entry)
      return
    redoStack.value.push(entry)
    await replay(entry, 'before')
  }

  async function redo() {
    const entry = redoStack.value.pop()
    if (!entry)
      return
    undoStack.value.push(entry)
    await replay(entry, 'after')
  }

  function reset() {
    undoStack.value = []
    redoStack.value = []
  }

  return { undo, redo, reset, canUndo, canRedo, lastAction }
}
