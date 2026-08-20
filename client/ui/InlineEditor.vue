<script setup lang="ts">
import type { BlockShape } from '../md/inline'
import type { SourceRange } from '../types'
import { computed, nextTick, ref, watch } from 'vue'
import { blockShape, canEditContainer, canEditVisually, serialiseBlock, serialiseContainer } from '../md/inline'
import { toggleBullet, toggleHeading, toggleQuote, toggleTagWrap, toggleWrap, toLink } from '../md/format'
import { getBlock, replaceBlock } from '../md/lines'
import { editing, reportError, selection } from '../state'
import { useStudio } from '../context'
import { onDomEvent } from '../composables/useDomEvent'
import StudioIcon from './parts/StudioIcon.vue'

/**
 * Editing a block's text where it sits, in two ways.
 *
 * The first is the block itself: it is made editable in place, so what you type
 * is set in the deck's own font, at its own size, in its own colour, wrapping
 * where it will really wrap. Nothing is simulated, because it is the slide.
 *
 * What comes back has to be Markdown again, and that is the risk in every
 * visual editor: round-tripping rendered HTML is where components, directives
 * and formatting go missing. So the block is only offered visually when its
 * markup can be written back exactly, which `md/inline.ts` decides by refusing
 * everything it does not recognise. A table, a fenced code block, a component,
 * a styled span: those open the second way, the block's Markdown as text, which
 * can express anything and never loses what it did not understand.
 */
const studio = useStudio()

type Mode = 'visual' | 'markdown'

const mode = ref<Mode>('markdown')
const draft = ref('')
const box = ref<HTMLTextAreaElement | null>(null)
const rect = ref<{ left: number, top: number, width: number } | null>(null)
const shape = ref<BlockShape | null>(null)

/** The rendered block being edited, and its markup as it was found. */
let editable: HTMLElement | null = null
let original = ''
let source = ''

/*
 * The lines the open editor owns.
 *
 * Usually the selection's own range, but not when a list item hands over the
 * whole list: what is written back then covers every item, so writing it over
 * the one item's range would leave the rest of the list standing underneath.
 */
let held: SourceRange | null = null

/*
 * Whether what was handed over is one block or a run of them.
 *
 * A text box is the second: the browser owns the whole slot, so Enter starts a
 * paragraph, a second Enter on an empty bullet leaves the list, and a selection
 * can run across two paragraphs, all without the editor closing and reopening
 * around a different element. Which one is in play decides which serialiser
 * writes the result back.
 */
let heldKind: 'block' | 'container' | 'prop' = 'block'



const range = computed(() => selection.value?.range ?? null)

/** A frontmatter value is a plain string, so it gets no formatting controls. */
const editingProp = computed(() => !!selection.value?.prop)

watch(editing, async (open) => {
  if (!open) {
    release()
    return
  }

  /*
   * Text a layout was handed, rather than text the slide holds.
   *
   * `eyebrow`, `title`, a speaker's name: the words are in the slide's
   * frontmatter and the layout renders them, so there is no line of Markdown to
   * select and nothing in the block editor applies. It is a plain string, so it
   * is edited as one and written straight back to the key it came from.
   */
  const propKey = selection.value?.prop
  const propEl = selection.value?.el
  if (propKey && propEl) {
    heldKind = 'prop'
    held = null
    shape.value = null
    source = String(studio.frontmatter()[propKey] ?? '')
    draft.value = source
    mode.value = 'visual'
    const at = propEl.getBoundingClientRect()
    rect.value = { left: at.left, top: at.top, width: Math.max(at.width, 260) }
    await nextTick()
    hold(propEl)

    // The whole value comes up selected. It is one string standing for one key,
    // the way a title placeholder behaves, so the first thing typed replaces it
    // rather than landing against whatever is already there.
    const chosen = window.getSelection()
    if (chosen) {
      const all = document.createRange()
      all.selectNodeContents(propEl)
      chosen.removeAllRanges()
      chosen.addRange(all)
    }
    return
  }

  // Editing an item of a list hands over the whole list.
  //
  // A list is written the way anyone writes one: type an item, press Enter,
  // type the next. The browser does that for nothing, but only when the thing
  // it is editing is the list rather than one item of it. Studio maps each item
  // to its own line so it can be moved and deleted on its own, and holding one
  // item made the most ordinary act on a list impossible.
  //
  // Both are mapped, so the list's own range is already known and everything
  // typed is written back through the same serialiser, one line per item.
  const picked = selection.value?.el
  const list = picked?.dataset.studioKind === 'list-item'
    ? picked.closest<HTMLElement>('[data-studio-kind="list"]')
    : null
  const listRange = list ? parseRange(list.dataset.studioSrc) : null

  let target = listRange ?? range.value
  let element = (listRange && list) || picked
  if (!target || !element)
    return

  // Prefer the whole run of blocks around it, so the slot behaves like one text
  // box. Only when that cannot be written back unchanged does this fall back to
  // the single block, and then to editing the Markdown.
  heldKind = 'block'
  // Not named `box`: that is the Markdown textarea's ref, and shadowing it here
  // made the fallback path dereference this instead of the field it meant.
  const run = containerOf(element)
  if (run) {
    const runSource = getBlock(studio.content(), run.range)
    if (canEditContainer(runSource, run.el as any, verbatim)) {
      heldKind = 'container'
      target = run.range
      element = run.el
    }
  }

  held = target
  source = getBlock(studio.content(), target)
  draft.value = source
  shape.value = blockShape(source)

  const found = element.getBoundingClientRect()
  rect.value = { left: found.left, top: found.top, width: Math.max(found.width, 260) }

  // Visual editing only where the rendered block can be written back as the
  // Markdown that is already there. Testing the real markup against the real
  // source, rather than trusting the block's kind, is what keeps a component,
  // a styled span or a shape the serialiser would flatten out of this path.
  mode.value = heldKind === 'container' || (shape.value && canEditVisually(source, element, shape.value))
    ? 'visual'
    : 'markdown'

  await nextTick()
  if (mode.value === 'visual')
    hold(element, element === picked ? undefined : picked)
  else
    box.value?.focus()
})

/**
 * The Markdown a non-text child of a container stands for.
 *
 * Looked up by the hint the renderer left on it, so a component inside a slot
 * survives an edit to the paragraphs around it.
 */
function verbatim(child: any): string | null {
  const at = parseRange((child as HTMLElement).dataset?.studioSrc)
  return at ? getBlock(studio.content(), at) : null
}

/**
 * The run of blocks a block belongs to, when its parent holds nothing else.
 *
 * Every child has to be a mapped block and the ranges have to follow one
 * another, which is what makes the parent a container of text rather than a
 * piece of layout that happens to have text in it.
 */
function containerOf(block: HTMLElement): { el: HTMLElement, range: SourceRange } | null {
  const parent = block.parentElement
  if (!parent)
    return null

  const children = [...parent.children] as HTMLElement[]
  // One block is enough. Holding the container rather than the block is what
  // lets Enter make a second block that did not exist before: a slot holding
  // only a list has to become a slot holding a list and a paragraph, and the
  // browser can only do that if it owns the box rather than the list.
  if (!children.length)
    return null

  const ranges: SourceRange[] = []
  for (const child of children) {
    const at = parseRange(child.dataset.studioSrc)
    if (!at)
      return null
    if (ranges.length && at[0] < ranges[ranges.length - 1][1])
      return null
    ranges.push(at)
  }

  return { el: parent, range: [ranges[0][0], ranges[ranges.length - 1][1]] }
}

/**
 * Whether the caret is in a list item of the box being edited.
 *
 * Asked of the DOM rather than of the block's shape, because a text box holding
 * a paragraph and a list has the shape of neither: what matters is where the
 * caret is now.
 */
function inListItem(): boolean {
  const chosen = window.getSelection()
  if (!editable || !chosen || chosen.rangeCount === 0)
    return false
  const node = chosen.getRangeAt(0).startContainer
  const host = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as HTMLElement | null
  const item = host?.closest('li')
  return !!item && editable.contains(item)
}

/** Reads the `line,line` hint an annotated element carries. */
function parseRange(raw: string | undefined): SourceRange | null {
  const parts = raw?.split(',').map(Number)
  return parts?.length === 2 && parts.every(Number.isFinite) ? [parts[0], parts[1]] : null
}

/**
 * Paste arrives as text, whatever it was copied from.
 *
 * A browser pastes the markup it was given: styled spans, classes, font tags,
 * whole tables. None of that is Markdown, so the serialiser refuses the block
 * and the edit is thrown away, which is what pasting into a box did before this
 * existed: the words vanished and nothing said why. Markdown can carry bold,
 * italic, underline, strike, code and links, and those the toolbar applies. The
 * rest is not worth losing the paragraph over.
 */
function onPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text/plain')
  if (text == null)
    return
  event.preventDefault()
  // Line breaks in a pasted block would each start a new element; the text is
  // taken as one run and the author can break it where they want it.
  document.execCommand('insertText', false, text.replace(/\r?\n/g, ' '))
}

/** Hands the block over to the browser to edit, and remembers how it was. */
function hold(element: HTMLElement, caretIn?: HTMLElement | null) {
  editable = element
  original = element.innerHTML
  element.setAttribute('contenteditable', 'true')
  element.classList.add('studio-editing')
  element.addEventListener('paste', onPaste)
  element.spellcheck = false

  // Marks as tags rather than inline styles, which is what can be written back
  // as `**` and `*` rather than as a span nobody asked for.
  document.execCommand('styleWithCSS', false, 'false')

  // Enter should start a paragraph, not the `div` browsers reach for by
  // default, because a paragraph is a block the serialiser recognises.
  document.execCommand('defaultParagraphSeparator', false, 'p')

  // Anything in the box that is not text is atomic: it can be selected and
  // deleted whole, which writes it out of the Markdown, but not typed into.
  if (heldKind === 'container') {
    for (const child of [...element.children] as HTMLElement[]) {
      if (!/^(h[1-6]|p|ul|ol|blockquote)$/i.test(child.tagName))
        child.setAttribute('contenteditable', 'false')
    }
  }

  // A double click already chose a word; anything else starts at the end.
  const chosen = window.getSelection()
  if (!chosen || !element.contains(chosen.anchorNode))
    element.focus()

  // When the list was handed over on behalf of one of its items, the caret
  // belongs in that item rather than wherever the list happens to start.
  if (caretIn && element.contains(caretIn) && chosen) {
    const at = document.createRange()
    at.selectNodeContents(caretIn)
    at.collapse(false)
    chosen.removeAllRanges()
    chosen.addRange(at)
  }
}

/** Gives the block back to the renderer, exactly as it was found. */
function release() {
  held = null
  if (!editable)
    return
  editable.removeEventListener('paste', onPaste)
  editable.removeAttribute('contenteditable')
  editable.classList.remove('studio-editing')
  editable.innerHTML = original
  editable = null
}

async function apply() {
  if (heldKind === 'prop') {
    const key = selection.value?.prop
    const written = (editable?.textContent ?? '').replace(/\s+/g, ' ').trim()
    release()
    editing.value = false
    if (key && written !== source.trim())
      await studio.setFrontmatter({ [key]: written }, `Set ${key}`)
    return
  }

  const target = held ?? range.value
  if (!target || !editing.value)
    return

  if (mode.value === 'markdown') {
    editing.value = false
    if (draft.value !== source)
      await studio.commit(replaceBlock(studio.content(), target, draft.value), 'Edit text')
    return
  }

  const element = editable
  const written = element
    ? (heldKind === 'container'
        ? serialiseContainer(element as any, verbatim)
        : (shape.value ? serialiseBlock(element, shape.value) : null))
    : null

  // Read before releasing: `release` puts the markup back as it was found.
  release()
  editing.value = false

  if (written === null) {
    reportError(new Error('That edit could not be written back as Markdown, so nothing was changed. Edit it as Markdown instead.'))
    return
  }

  if (written !== source)
    await studio.commit(replaceBlock(studio.content(), target, written), 'Edit text')
}

function cancel() {
  release()
  editing.value = false
}

/** Switches to editing the Markdown, keeping whatever has been typed. */
function toMarkdown() {
  if (mode.value === 'markdown')
    return
  const written = editable
    ? (heldKind === 'container'
        ? serialiseContainer(editable as any, verbatim)
        : (shape.value ? serialiseBlock(editable, shape.value) : null))
    : null
  release()
  draft.value = written ?? source
  mode.value = 'markdown'
  nextTick(() => box.value?.focus())
}

/** Applies a formatting action to whatever is selected in the textarea. */
function format(action: (sel: { text: string, start: number, end: number }) => { text: string, start: number, end: number }) {
  const element = box.value
  if (!element)
    return
  const result = action({ text: draft.value, start: element.selectionStart, end: element.selectionEnd })
  draft.value = result.text
  nextTick(() => {
    element.focus()
    element.setSelectionRange(result.start, result.end)
  })
}

/**
 * Wraps the selection in a tag the browser has no command for.
 *
 * `execCommand` covers bold, italic, strikethrough and links; inline code has
 * no command of its own, so it is done by hand.
 */
function wrapSelection(tag: string) {
  const chosen = window.getSelection()
  if (!chosen || chosen.rangeCount === 0 || chosen.isCollapsed)
    return
  const at = chosen.getRangeAt(0)
  const wrapper = document.createElement(tag)
  wrapper.appendChild(at.extractContents())
  at.insertNode(wrapper)
  chosen.removeAllRanges()
  const after = document.createRange()
  after.selectNodeContents(wrapper)
  chosen.addRange(after)
}

/**
 * A mark, on or off, the way a word processor does it.
 *
 * `execCommand` is a toggle in principle, but it decides which way to go by
 * asking the browser whether the selection is already bold, and after the first
 * application the selection still refers to the text node the command replaced.
 * Chromium answers no, bolds what is already bold, and the button appears dead:
 * the only way back was to leave the block, come in again and reselect. Owning
 * both directions removes the guesswork, and every tag written here is one the
 * serialiser already knows how to put back as Markdown.
 */
function toggleMark(tag: string, aliases: string[]) {
  const chosen = window.getSelection()
  if (!editable || !chosen || chosen.rangeCount === 0 || chosen.isCollapsed)
    return

  const start = chosen.getRangeAt(0).startContainer
  const host = (start.nodeType === Node.ELEMENT_NODE ? start : start.parentElement) as HTMLElement | null
  const existing = host?.closest<HTMLElement>(aliases.join(','))

  if (!existing || !editable.contains(existing)) {
    wrapSelection(tag)
    return
  }

  // Lift the children out rather than replacing the text, so a mark nested
  // inside this one survives being unwrapped. The nodes are not normalised
  // afterwards, because the range below is expressed in terms of them.
  const parent = existing.parentNode
  if (!parent)
    return
  const moved = [...existing.childNodes]
  for (const node of moved)
    parent.insertBefore(node, existing)
  parent.removeChild(existing)

  if (!moved.length)
    return
  const after = document.createRange()
  after.setStartBefore(moved[0])
  after.setEndAfter(moved[moved.length - 1])
  chosen.removeAllRanges()
  chosen.addRange(after)
}

const marks = [
  { icon: 'bold', title: 'Bold (Ctrl+B)', markdown: () => format(sel => toggleWrap(sel, '**')), visual: () => toggleMark('b', ['b', 'strong']) },
  { icon: 'italic', title: 'Italic (Ctrl+I)', markdown: () => format(sel => toggleWrap(sel, '*')), visual: () => toggleMark('i', ['i', 'em']) },
  { icon: 'underline', title: 'Underline (Ctrl+U)', markdown: () => format(sel => toggleTagWrap(sel, '<u>', '</u>')), visual: () => toggleMark('u', ['u']) },
  { icon: 'code', title: 'Inline code', markdown: () => format(sel => toggleWrap(sel, '`')), visual: () => toggleMark('code', ['code']) },
  { icon: 'strike', title: 'Strikethrough', markdown: () => format(sel => toggleWrap(sel, '~~')), visual: () => toggleMark('s', ['s', 'del', 'strike']) },
  { icon: 'link', title: 'Link', markdown: () => format(sel => toLink(sel)), visual: () => wrapSelection('a') },
]

/** Block level changes, which rewrite the Markdown's markers rather than its text. */
const blocks = [
  { icon: 'h1', title: 'Heading 1', run: () => format(sel => toggleHeading(sel, 1)) },
  { icon: 'h2', title: 'Heading 2', run: () => format(sel => toggleHeading(sel, 2)) },
  { icon: 'list', title: 'Bullet list', run: () => format(sel => toggleBullet(sel)) },
  { icon: 'quote', title: 'Quote', run: () => format(sel => toggleQuote(sel)) },
]

function runMark(mark: typeof marks[number]) {
  if (mode.value === 'visual')
    mark.visual()
  else
    mark.markdown()
}

function onKeydown(event: KeyboardEvent) {
  const modifier = event.metaKey || event.ctrlKey
  if (event.key === 'Escape') {
    event.preventDefault()
    // Committed, not thrown away. Escape in a word processor means "I am done
    // with this box", and undo is how you take an edit back. Discarding a whole
    // typing session on one keystroke, with no warning and nothing on the undo
    // stack, is the one way this editor could lose work outright.
    apply()
    return
  }
  if (modifier && event.key === 'Enter') {
    event.preventDefault()
    apply()
    return
  }
  /*
   * Tab moves a list item in and out a level.
   *
   * It is the one key a list is expected to answer to beyond Enter, and it went
   * to the browser instead: focus left the box entirely and landed on Slidev's
   * navbar. `indent` and `outdent` are the two commands browsers still
   * implement well for lists in a contenteditable, and what they build is a
   * nested list, which the serialiser now writes back as indentation.
   */
  if (!modifier && event.key === 'Tab' && inListItem()) {
    event.preventDefault()
    document.execCommand(event.shiftKey ? 'outdent' : 'indent')
    return
  }

  if (!modifier)
    return
  if (event.key === 'b') {
    event.preventDefault()
    runMark(marks[0])
  }
  if (event.key === 'i') {
    event.preventDefault()
    runMark(marks[1])
  }
  if (event.key === 'u') {
    event.preventDefault()
    runMark(marks[2])
  }
}

/**
 * While the block is being typed into, the keys belong to it.
 *
 * Slidev's own shortcuts live on the document, so without this a space would
 * advance the slide out from under the sentence being written.
 */
onDomEvent<KeyboardEvent>(document, 'keydown', (event) => {
  if (mode.value !== 'visual' || !editing.value || !editable)
    return
  if (!(event.target instanceof Node) || !editable.contains(event.target))
    return
  event.stopPropagation()
  onKeydown(event)
}, { capture: true })

/** A click anywhere else finishes the edit, the way a canvas tool does. */
onDomEvent<PointerEvent>(document, 'pointerdown', (event) => {
  if (mode.value !== 'visual' || !editing.value || !editable)
    return
  const target = event.target
  if (!(target instanceof Node))
    return
  if (editable.contains(target) || (target instanceof Element && target.closest('.studio-inline')))
    return
  apply()
}, { capture: true })

// Keep the toolbar over its block while the deck scrolls or the window resizes.
onDomEvent(window, 'resize', () => {
  const element = selection.value?.el
  if (editing.value && element) {
    const found = element.getBoundingClientRect()
    rect.value = { left: found.left, top: found.top, width: Math.max(found.width, 260) }
  }
})
</script>

<template>
  <div
    v-if="editing && rect"
    class="studio-inline"
    :class="{ 'studio-inline--floating': mode === 'visual' }"
    :style="mode === 'visual'
      ? { left: `${rect.left}px`, top: `${Math.max(4, rect.top - 42)}px` }
      : { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px` }"
  >
    <div v-if="!editingProp" class="studio-inline__bar">
      <button
        v-for="mark in marks"
        :key="mark.icon"
        class="studio-icon-button"
        :title="mark.title"
        @mousedown.prevent
        @click="runMark(mark)"
      >
        <StudioIcon :name="mark.icon" :size="14" />
      </button>

      <template v-if="mode === 'markdown'">
        <button
          v-for="action in blocks"
          :key="action.icon"
          class="studio-icon-button"
          :title="action.title"
          @mousedown.prevent
          @click="action.run()"
        >
          <StudioIcon :name="action.icon" :size="14" />
        </button>
      </template>

      <span class="studio-toolbar__divider" />

      <button
        v-if="mode === 'visual'"
        class="studio-icon-button"
        title="Edit as Markdown"
        @mousedown.prevent
        @click="toMarkdown"
      >
        <StudioIcon name="code" :size="14" />
      </button>
      <button class="studio-icon-button" title="Apply (Ctrl+Enter)" @mousedown.prevent @click="apply">
        <StudioIcon name="check" :size="14" />
      </button>
      <button class="studio-icon-button" title="Cancel (Esc)" @mousedown.prevent @click="cancel">
        <StudioIcon name="close" :size="14" />
      </button>
    </div>

    <textarea
      v-if="mode === 'markdown'"
      ref="box"
      v-model="draft"
      spellcheck="false"
      rows="3"
      @keydown="onKeydown"
      @blur="apply"
    />
  </div>
</template>
