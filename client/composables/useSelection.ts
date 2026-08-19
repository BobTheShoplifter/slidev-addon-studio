import type { SourceRange, StudioTarget, TargetKind } from '../types'
import { nextTick, onScopeDispose, watch, watchEffect } from 'vue'
import { removeBlock } from '../md/lines'
import { belongsToSlide, canvasElement, mappedElements, slideElement } from '../dom'
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

/**
 * Studio's own chrome: the dock, the selection overlay, the handles, the inline
 * editor. All of it is teleported to `body`, so a press on it is not a click on
 * the slide and must not be claimed here.
 *
 * Claiming it was the cause of three separate complaints: a press on the move
 * overlay or on the east, south-east and south handles was swallowed before the
 * handle's own listener could run, so every other drag did nothing; and a
 * double click on a selected block landed on the overlay covering it, so
 * editing text could not be started at all once something was selected.
 */
/**
 * Whether an element is actually on screen.
 *
 * A block waiting for its click step still occupies its space, so the geometric
 * fallback happily handed back something invisible: clicking the blank gap where
 * it will appear put handles around nothing.
 */
function isVisible(el: Element): boolean {
  const style = getComputedStyle(el)
  return style.visibility !== 'hidden' && Number.parseFloat(style.opacity) > 0.01
}

function isStudioChrome(target: EventTarget | null): target is Element {
  return target instanceof Element && !!target.closest('.slidev-studio')
}

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
      .filter(el => getComputedStyle(el).pointerEvents === 'none' && isVisible(el))
      .map(el => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom)
      .sort((a, b) => a.box.width * a.box.height - b.box.width * b.box.height)

    return candidates.length ? describe(candidates[0].el, no(), content()) : null
  }

  /**
   * What the pointer is over, ignoring Studio's own chrome on top of it.
   *
   * The selection overlay covers the block it belongs to, so the ordinary
   * target of a click there is the overlay rather than anything on the slide.
   */
  function throughChrome(x: number, y: number): StudioTarget | null {
    for (const node of document.elementsFromPoint(x, y)) {
      if (isStudioChrome(node))
        continue
      const target = targetFrom(node)
      if (target)
        return target
    }
    return targetFromPoint(x, y)
  }

  function select(node: EventTarget | null) {
    const target = targetFrom(node)
    if (target)
      selection.value = target
  }

  onDomEvent<PointerEvent>(document, 'pointerdown', (event) => {
    if (!studioOpen.value || event.button !== 0 || editing.value)
      return
    // The overlay and the handles handle themselves.
    if (isStudioChrome(event.target))
      return
    // A field in the dock keeps focus otherwise, and the next Backspace edits
    // that field instead of deleting the selected block.
    if (isTyping(document.activeElement))
      (document.activeElement as HTMLElement).blur()

    const target = targetFrom(event.target) ?? targetFromPoint(event.clientX, event.clientY)
    if (!target) {
      // Inside the slide but not on anything mapped: say so rather than
      // dropping the click without a word, and let go of what was selected,
      // since leaving the outline behind reads as the click not registering.
      const onSlide = event.target instanceof Element && belongsToSlide(event.target, no())
      missed.value = onSlide
      if (onSlide)
        selection.value = null
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
    // Over the editor's own chrome, nothing on the slide is hovered. The
    // selection overlay is the exception: it lies on top of the block it
    // belongs to, and clearing there made the outline flicker under the
    // pointer.
    if (isStudioChrome(event.target)) {
      if (!(event.target instanceof Element && event.target.closest('.studio-move')))
        hovered.value = null
      return
    }
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

    // The first click of a double click selects, which lays the move overlay
    // over the block, so the second click lands on the overlay rather than on
    // the text. What is under the pointer is what was aimed at, so the overlay
    // is looked through rather than treated as the answer: double clicking a
    // nested block inside a selected container edits that block, not the
    // container.
    if (event.target instanceof Element && event.target.closest('.studio-move')) {
      const beneath = throughChrome(event.clientX, event.clientY) ?? selection.value
      if (!beneath?.range)
        return
      event.preventDefault()
      selection.value = beneath
      editing.value = true
      return
    }

    if (isStudioChrome(event.target))
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
      // One layer at a time. A key pressed in a field belongs to that field,
      // and the inline editor closes itself, so clearing the selection here as
      // well meant cancelling an edit lost the block being edited.
      //
      // Tested on the node itself rather than on its ancestors: the editor is
      // unmounted by the time this runs, and `closest` on a node that has been
      // taken out of the document finds nothing.
      if (isTyping(event.target) || isStudioChrome(event.target))
        return
      if (editing.value)
        editing.value = false
      else
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

    // A re-render can land a frame or several later, and binding at a fixed
    // delay bound the selection to the element that was about to be thrown
    // away: the outline vanished and the next press went to the slide instead
    // of to the overlay, so every other drag did nothing. Waiting for an
    // element that is actually in the document, and rebinding again if that one
    // is replaced too, is what keeps a selection alive across an edit.
    const deadline = Date.now() + 1500
    let bound: StudioTarget | null = null
    let fallback: StudioTarget | null = null

    while (Date.now() < deadline) {
      if (!hint || !slideElement(no()))
        return

      const best = mappedElements(no())
        .filter(el => (el.dataset.studioKind ?? 'unknown') === kind && el.dataset.studioTag === tag)
        // Attached is the test, not visible: an element that has just been
        // given `v-click` is hidden at the current step, and refusing to
        // rebind to it leaves the selection on a node that no longer exists.
        .filter(el => document.contains(el))
        .map(el => ({ el, start: parseHint(el.dataset.studioSrc)?.[0] ?? Number.POSITIVE_INFINITY }))
        .sort((a, b) => Math.abs(a.start - hint[0]) - Math.abs(b.start - hint[0]))[0]?.el

      const candidate = best ? describe(best, no(), content()) : null
      fallback = candidate ?? fallback

      // The source is updated the moment the write returns, while the rebuilt
      // DOM lands a few frames later. Binding in between describes the old
      // element against the new Markdown, which cannot be traced, so the
      // selection came back with no range and nothing could be edited or
      // deleted afterwards. Waiting for the two to agree is the fix.
      if (candidate?.range) {
        bound = candidate
        break
      }

      await new Promise(resolve => setTimeout(resolve, 40))
    }

    // Keep what the user had if nothing can be traced at all. An edit that
    // briefly cannot be rebound used to empty the whole panel, which read as
    // the editor losing the thing you were working on.
    const next = bound ?? fallback
    if (next)
      selection.value = next
  }

  /**
   * Rebinds the selection when the slide is re-rendered under it.
   *
   * Any rebuild replaces the DOM, and the selection then points at a node that
   * is no longer on screen: the outline and the handles disappear, and the next
   * press lands on the slide rather than on them. That happens on every edit
   * the editor makes, and also when the author edits the Markdown by hand.
   */
  let rebinding = false
  let observer: MutationObserver | null = null

  watchEffect(() => {
    observer?.disconnect()
    observer = null

    // Watched on the canvas rather than on the slide, because a rebuild
    // replaces the slide's own root: an observer bound to that root is watching
    // a detached node from the first edit onwards, which is no observer at all.
    const root = studioOpen.value ? canvasElement() : null
    if (!root)
      return

    observer = new MutationObserver(() => {
      const current = selection.value
      if (rebinding || !current || document.contains(current.el))
        return

      // A selection that failed to trace has no range of its own, so the
      // element's own stamp is the hint. Without it the rebind gave up at once
      // and the selection stayed on a node that had gone.
      const hint = current.range ?? parseHint(current.el.dataset.studioSrc)
      rebinding = true
      reselect(hint, current.kind, current.tag).finally(() => (rebinding = false))
    })
    observer.observe(root, { childList: true, subtree: true })
  })

  onScopeDispose(() => observer?.disconnect())

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

  /**
   * Selects whatever is under the pointer, looking through Studio's own chrome.
   *
   * The selection overlay covers its block, so without this a click there could
   * never reach anything: not a nested block inside the selection, and not
   * another element that happens to lie underneath it.
   */
  function selectThrough(x: number, y: number) {
    const target = throughChrome(x, y)
    if (target && target.el !== selection.value?.el)
      selection.value = target
  }

  return { select, targetFrom, reselect, selectInserted, selectThrough }
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
