import type { SourceRange, StudioTarget, TargetKind } from '../types'
import { nextTick, watch } from 'vue'
import { removeBlock } from '../md/lines'
import { belongsToSlide, mappedElements, slideElement } from '../dom'
import { onDomEvent } from './useDomEvent'
import { normalise, resolveRange } from '../md/locate'
import { readDrag } from '../md/drag'
import { hovered, selection, studioOpen } from '../state'

/**
 * Turns a click on the rendered slide into a Markdown range Studio can edit.
 *
 * The rendered element carries a `data-studio-src` hint from markdown-it. That
 * hint is only trusted after it has been checked against the real source, see
 * `md/locate.ts`, because editing the wrong lines is the one mistake that
 * would cost a user their deck.
 */

export function useSelection(
  no: () => number,
  content: () => string,
  remove?: (next: string, label: string) => Promise<void>,
) {
  function targetFrom(node: EventTarget | null): StudioTarget | null {
    if (!(node instanceof Element))
      return null

    // Only the slide being edited: a click on the pre-rendered next slide
    // would otherwise be traced against the wrong Markdown.
    if (!belongsToSlide(node, no()))
      return null

    const el = node.closest<HTMLElement>('[data-studio-src]')
    if (!el || !belongsToSlide(el, no()))
      return null

    return describe(el, no(), content())
  }

  function select(node: EventTarget | null) {
    const target = targetFrom(node)
    if (target)
      selection.value = target
  }

  onDomEvent<PointerEvent>(document, 'pointerdown', (event) => {
    if (!studioOpen.value || event.button !== 0)
      return
    const target = targetFrom(event.target)
    if (!target)
      return
    // Claim the gesture before Slidev's own `v-drag` handles or a link can.
    event.preventDefault()
    event.stopPropagation()
    selection.value = target
  }, { capture: true })

  onDomEvent<PointerEvent>(document, 'pointermove', (event) => {
    if (!studioOpen.value)
      return
    hovered.value = targetFrom(event.target)
  }, { capture: true, passive: true })

  onDomEvent<KeyboardEvent>(document, 'keydown', (event) => {
    if (!studioOpen.value)
      return

    if (event.key === 'Escape') {
      selection.value = null
      return
    }

    if (event.key !== 'Backspace' && event.key !== 'Delete')
      return
    // Never while the user is typing into one of the editor's own fields.
    if (isTyping(event.target) || !selection.value?.range || !remove)
      return

    // Backspace would otherwise navigate the browser back and lose the deck.
    event.preventDefault()
    const target = selection.value
    selection.value = null
    remove(removeBlock(content(), target.range!), `Delete ${target.label}`)
  })

  watch(studioOpen, (open) => {
    if (!open) {
      selection.value = null
      hovered.value = null
    }
  })

  /**
   * After a write the slide re-renders and the old element is gone, often at a
   * slightly different line. Finding the nearest element of the same kind keeps
   * the selection, and every panel bound to it, alive across an edit.
   */
  async function reselect(hint: SourceRange | null, kind: TargetKind, tag?: string) {
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 80))

    if (!hint || !slideElement(no())) {
      selection.value = null
      return
    }

    const candidates = mappedElements(no())
      .filter(el => (el.dataset.studioKind ?? 'unknown') === kind && el.dataset.studioTag === tag)

    const best = candidates
      .map(el => ({ el, start: parseHint(el.dataset.studioSrc)?.[0] ?? Number.POSITIVE_INFINITY }))
      .sort((a, b) => Math.abs(a.start - hint[0]) - Math.abs(b.start - hint[0]))[0]

    selection.value = best ? describe(best.el, no(), content()) : null
  }

  return { select, targetFrom, reselect }
}

/** Focus is in a text field, so the key belongs to that field, not the canvas. */
function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement))
    return false
  return target.isContentEditable
    || ['input', 'textarea', 'select'].includes(target.tagName.toLowerCase())
}

function describe(el: HTMLElement, no: number, content: string): StudioTarget {
  const kind = (el.dataset.studioKind ?? 'unknown') as TargetKind
  const tag = el.dataset.studioTag
  const hint = parseHint(el.dataset.studioSrc)

  const signature = {
    kind,
    tag,
    text: tag ? undefined : normalise(el.textContent ?? ''),
  }
  const range = resolveRange(content, hint, signature)

  return {
    el,
    no,
    range,
    kind,
    tag,
    positioned: range ? !!readDrag(content, range) : false,
    label: labelFor(kind, tag, el),
  }
}

function parseHint(raw: string | undefined): SourceRange | null {
  if (!raw)
    return null
  const [start, end] = raw.split(',').map(Number)
  return Number.isFinite(start) && Number.isFinite(end) ? [start, end] : null
}

function labelFor(kind: TargetKind, tag: string | undefined, el: HTMLElement): string {
  if (tag)
    return `<${tag}>`
  switch (kind) {
    case 'heading': return el.tagName.toUpperCase()
    case 'paragraph': return 'Text'
    case 'list': return 'List'
    case 'list-item': return 'List item'
    case 'quote': return 'Quote'
    case 'table': return 'Table'
    case 'rule': return 'Divider'
    default: return el.tagName.toLowerCase()
  }
}
