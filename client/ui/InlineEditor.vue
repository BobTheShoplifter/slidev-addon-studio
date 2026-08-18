<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { toggleBullet, toggleHeading, toggleQuote, toggleWrap, toLink } from '../md/format'
import { getBlock, replaceBlock } from '../md/lines'
import { editing, selection } from '../state'
import { useStudio } from '../context'
import { onDomEvent } from '../composables/useDomEvent'
import StudioIcon from './parts/StudioIcon.vue'

/**
 * Editing a block's text where it sits.
 *
 * What is edited is the block's Markdown, not its rendered HTML. That is the
 * whole reason the toolbar can be trusted: bold writes `**`, a heading writes
 * `##`, and a table or a fenced code block is just text like everything else,
 * so those become editable for free. Round-tripping rendered HTML back into
 * Markdown is where visual editors lose components, directives and formatting,
 * and this deck is full of all three.
 */
const studio = useStudio()

const draft = ref('')
const box = ref<HTMLTextAreaElement | null>(null)
const rect = ref<{ left: number, top: number, width: number } | null>(null)

const range = computed(() => selection.value?.range ?? null)

watch(editing, async (open) => {
  if (!open || !range.value)
    return
  draft.value = getBlock(studio.content(), range.value)
  const element = selection.value?.el
  if (element) {
    const found = element.getBoundingClientRect()
    rect.value = { left: found.left, top: found.top, width: Math.max(found.width, 260) }
  }
  await nextTick()
  box.value?.focus()
  box.value?.select()
})

async function apply() {
  const target = range.value
  if (!target || !editing.value)
    return
  editing.value = false
  const next = replaceBlock(studio.content(), target, draft.value)
  await studio.commit(next, 'Edit text')
}

function cancel() {
  editing.value = false
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

const actions = [
  { icon: 'bold', title: 'Bold (Ctrl+B)', run: () => format(sel => toggleWrap(sel, '**')) },
  { icon: 'italic', title: 'Italic (Ctrl+I)', run: () => format(sel => toggleWrap(sel, '*')) },
  { icon: 'code', title: 'Inline code', run: () => format(sel => toggleWrap(sel, '`')) },
  { icon: 'strike', title: 'Strikethrough', run: () => format(sel => toggleWrap(sel, '~~')) },
  { icon: 'link', title: 'Link', run: () => format(sel => toLink(sel)) },
  { icon: 'h1', title: 'Heading 1', run: () => format(sel => toggleHeading(sel, 1)) },
  { icon: 'h2', title: 'Heading 2', run: () => format(sel => toggleHeading(sel, 2)) },
  { icon: 'list', title: 'Bullet list', run: () => format(sel => toggleBullet(sel)) },
  { icon: 'quote', title: 'Quote', run: () => format(sel => toggleQuote(sel)) },
]

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
    format(sel => toggleWrap(sel, '**'))
  }
  if (event.key === 'i') {
    event.preventDefault()
    format(sel => toggleWrap(sel, '*'))
  }
}

// Keep the editor over its block while the deck scrolls or the window resizes.
onDomEvent(window, 'resize', () => {
  const element = selection.value?.el
  if (editing.value && element) {
    const found = element.getBoundingClientRect()
    rect.value = { left: found.left, top: found.top, width: Math.max(found.width, 260) }
  }
})
</script>

<template>
  <div v-if="editing && rect" class="studio-inline" :style="{ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px` }">
    <div class="studio-inline__bar">
      <button
        v-for="action in actions"
        :key="action.icon"
        class="studio-icon-button"
        :title="action.title"
        @mousedown.prevent
        @click="action.run()"
      >
        <StudioIcon :name="action.icon" :size="14" />
      </button>
      <span class="studio-toolbar__divider" />
      <button class="studio-icon-button" title="Apply (Ctrl+Enter)" @mousedown.prevent @click="apply">
        <StudioIcon name="check" :size="14" />
      </button>
      <button class="studio-icon-button" title="Cancel (Esc)" @mousedown.prevent @click="cancel">
        <StudioIcon name="close" :size="14" />
      </button>
    </div>

    <textarea
      ref="box"
      v-model="draft"
      spellcheck="false"
      rows="3"
      @keydown="onKeydown"
      @blur="apply"
    />
  </div>
</template>
