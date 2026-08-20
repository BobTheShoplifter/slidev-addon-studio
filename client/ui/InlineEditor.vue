<script setup lang="ts">
import type { BlockShape } from '../md/inline'
import { computed, nextTick, ref, watch } from 'vue'
import { blockShape, canEditVisually, serialiseBlock } from '../md/inline'
import { toggleBullet, toggleHeading, toggleQuote, toggleWrap, toLink } from '../md/format'
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

const range = computed(() => selection.value?.range ?? null)

watch(editing, async (open) => {
  if (!open) {
    release()
    return
  }

  const target = range.value
  const element = selection.value?.el
  if (!target || !element)
    return

  source = getBlock(studio.content(), target)
  draft.value = source
  shape.value = blockShape(source)

  const found = element.getBoundingClientRect()
  rect.value = { left: found.left, top: found.top, width: Math.max(found.width, 260) }

  // Visual editing only where the rendered block can be written back as the
  // Markdown that is already there. Testing the real markup against the real
  // source, rather than trusting the block's kind, is what keeps a component,
  // a styled span or a shape the serialiser would flatten out of this path.
  mode.value = shape.value && canEditVisually(source, element, shape.value) ? 'visual' : 'markdown'

  await nextTick()
  if (mode.value === 'visual')
    hold(element)
  else
    box.value?.focus()
})

/** Hands the block over to the browser to edit, and remembers how it was. */
function hold(element: HTMLElement) {
  editable = element
  original = element.innerHTML
  element.setAttribute('contenteditable', 'true')
  element.classList.add('studio-editing')
  element.spellcheck = false

  // Marks as tags rather than inline styles, which is what can be written back
  // as `**` and `*` rather than as a span nobody asked for.
  document.execCommand('styleWithCSS', false, 'false')

  // A double click already chose a word; anything else starts at the end.
  const chosen = window.getSelection()
  if (!chosen || !element.contains(chosen.anchorNode))
    element.focus()
}

/** Gives the block back to the renderer, exactly as it was found. */
function release() {
  if (!editable)
    return
  editable.removeAttribute('contenteditable')
  editable.classList.remove('studio-editing')
  editable.innerHTML = original
  editable = null
}

async function apply() {
  const target = range.value
  if (!target || !editing.value)
    return

  if (mode.value === 'markdown') {
    editing.value = false
    if (draft.value !== source)
      await studio.commit(replaceBlock(studio.content(), target, draft.value), 'Edit text')
    return
  }

  const element = editable
  const written = element && shape.value ? serialiseBlock(element, shape.value) : null

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
  const written = editable && shape.value ? serialiseBlock(editable, shape.value) : null
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

const marks = [
  { icon: 'bold', title: 'Bold (Ctrl+B)', markdown: () => format(sel => toggleWrap(sel, '**')), visual: () => document.execCommand('bold') },
  { icon: 'italic', title: 'Italic (Ctrl+I)', markdown: () => format(sel => toggleWrap(sel, '*')), visual: () => document.execCommand('italic') },
  { icon: 'code', title: 'Inline code', markdown: () => format(sel => toggleWrap(sel, '`')), visual: () => wrapSelection('code') },
  { icon: 'strike', title: 'Strikethrough', markdown: () => format(sel => toggleWrap(sel, '~~')), visual: () => document.execCommand('strikeThrough') },
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
    cancel()
    return
  }
  if (modifier && event.key === 'Enter') {
    event.preventDefault()
    apply()
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
    <div class="studio-inline__bar">
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
