import type { SourceRange, StudioTarget, TargetKind } from '../types'
import { nextTick, watch } from 'vue'
import { removeBlock } from '../md/lines'
import { belongsToSlide, mappedElements, slideElement } from '../dom'
import { onDomEvent } from './useDomEvent'
import { normalise, resolveRange } from '../md/locate'
import { readDrag } from '../md/drag'
import { editing, hovered, missed, selection, studioOpen } from '../state'

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

    // A code editor embedded in a slide is the one thing on the canvas that
    // needs the raw click: claiming it would make the editor untypeable.
    if (node.closest('.monaco-editor, .slidev-monaco-container'))
      return null

    const el = node.closest<HTMLElement>('[data-studio-src]')
    if (!el || !belongsToSlide(el, no()))
      return null

    return describe(el, no(), content())
  }

  /**
   * Finds a block by where the pointer is rather than by what it hit.
   *
   * An embedded frame swallows the pointer, so Studio turns pointer events off
   * for embeds while it is open. That makes a component whose root *is* the
   * frame, such as Youtube or Tweet, impossible to hit the ordinary way: the
   * click passes straight through to the layout behind it. This picks the
   * smallest mapped element that the point falls inside, among exactly those
   * elements the editor made unhittable.
   */
  function targetFromPoint(x: number, y: number): StudioTarget | null {
    const candidates = mappedElements(no())
      .filter(el => getComputedStyle(el).pointerEvents === 'none')
      .map(el => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom)
      .sort((a, b) => a.box.width * a.box.height - b.box.width * b.box.height)

    return candidates.length ? describe(candidates[0].el, no(), content()) : null
  }

  function select(node: EventTarget | null) {
    const target = targetFrom(node)
    if (target)
      selection.value = target
  }

  onDomEvent<PointerEvent>(document, 'pointerdown', (event) => {
    if (!studioOpen.value || event.button !== 0 || editing.value)
      return
    const target = targetFrom(event.target) ?? targetFromPoint(event.clientX, event.clientY)
    if (!target) {
      // Inside the slide but not on anything mapped: say so rather than
      // dropping the click without a word.
      missed.value = event.target instanceof Element && belongsToSlide(event.target, no())
      return
    }
    // Claim the gesture before Slidev's own `v-drag` handles or a link can.
    event.preventDefault()
    event.stopPropagation()
    missed.value = false
    selection.value = target
  }, { capture: true })

  onDomEvent<PointerEvent>(document, 'pointermove', (event) => {
    if (!studioOpen.value || editing.value)
      return
    // Deliberately not the geometric fallback: hovering runs on every pointer
    // move, and reading computed styles for a whole slide there is enough work
    // to stall the renderer.
    hovered.value = targetFrom(event.target)
  }, { capture: true, passive: true })

  // Double click edits the text where it sits, which is what people expect of
  // anything on a canvas.
  onDomEvent<MouseEvent>(document, 'dblclick', (event) => {
    if (!studioOpen.value)
      return
    const target = targetFrom(event.target) ?? targetFromPoint(event.clientX, event.clientY)
    if (!target?.range)
      return
    event.preventDefault()
    selection.value = target
    editing.value = true
  }, { capture: true })

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

    if (!hint || !slideElement(no()))
      return

    const candidates = mappedElements(no())
      .filter(el => (el.dataset.studioKind ?? 'unknown') === kind && el.dataset.studioTag === tag)

    const best = candidates
      .map(el => ({ el, start: parseHint(el.dataset.studioSrc)?.[0] ?? Number.POSITIVE_INFINITY }))
      .sort((a, b) => Math.abs(a.start - hint[0]) - Math.abs(b.start - hint[0]))[0]

    // Keep what the user had if the element cannot be found this instant. An
    // edit that briefly cannot be rebound used to empty the whole panel, which
    // read as the editor losing the thing you were working on.
    if (best)
      selection.value = describe(best.el, no(), content())
  }

  /**
   * Selects a block that was just inserted.
   *
   * Insertion appends to the end of the slide, so the last matching element is
   * the new one. For a plain Markdown block there is no tag to match on, so the
   * last mapped element of the slide is the best available answer.
   */
  async function selectInserted(tag?: string) {
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 120))

    const candidates = mappedElements(no())
    const matching = tag ? candidates.filter(el => el.dataset.studioTag === tag) : candidates
    const el = matching.at(-1) ?? candidates.at(-1)
    if (el)
      selection.value = describe(el, no(), content())
  }

  return { select, targetFrom, reselect, selectInserted }
}

/**
 * The element's text, with a separator at every element boundary.
 *
 * `textContent` concatenates descendants with nothing between them, so
 * `<h1>angripere<br>faktisk</h1>` reads as "angriperefaktisk" and a table's
 * header row as "PakkeLengdePublikum". The Markdown side turns every tag into a
 * space, so comparing the two would never match. Tables, headings with inline
 * markup and many lists all failed for this one reason.
 */
function textOf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE)
    return node.textContent ?? ''
  if (node.nodeType !== Node.ELEMENT_NODE)
    return ''
  return [...node.childNodes].map(textOf).join(' ')
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
    sig: el.dataset.studioSig,
    text: tag ? undefined : normalise(textOf(el)),
    nested: el.dataset.studioNested === '1',
  }
  const range = resolveRange(content, hint, signature)

  return {
    el,
    no,
    range,
    kind,
    tag,
    positioned: range ? !!readDrag(content, range) : false,
    nested: el.dataset.studioNested === '1',
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
    case 'code': return 'Code block'
    default: return el.tagName.toLowerCase()
  }
}
