<script setup lang="ts">
import type { StudioContext } from '../context'
import { useNav } from '@slidev/client'
import { useWindowSize } from '@vueuse/core'
import { computed, onScopeDispose, provide, watch, watchEffect } from 'vue'
import { useSelection } from '../composables/useSelection'
import { useSlideCanvas } from '../composables/useSlideCanvas'
import { useSlideSource } from '../composables/useSlideSource'
import { useTransformGizmo } from '../composables/useTransformGizmo'
import { studioContext, studioKey } from '../context'
import { dockWidth, lastError, selection, studioOpen } from '../state'
import InlineEditor from './InlineEditor.vue'
import SelectionLayer from './SelectionLayer.vue'
import StudioDock from './StudioDock.vue'
import StudioToolbar from './StudioToolbar.vue'
import '../../styles/studio.css'

/**
 * The editor shell.
 *
 * Mounted from `global-top.vue`, which means it lives outside the slide's own
 * component tree: it can watch and rewrite the deck without any of its state
 * ending up in an exported slide.
 */
const nav = useNav()
const no = computed(() => nav.currentSlideNo.value)

const source = useSlideSource(no)
const canvas = useSlideCanvas(() => Number(source.frontmatter.value.zoom ?? 1))
async function commit(content: string, label: string, options?: { skipHmr?: boolean, keepSelection?: boolean }) {
  const current = selection.value
  await source.setContent(content, label, options)

  // Nothing re-rendered, so the element the user is holding is still the one on
  // screen. Re-finding it would only make the panel flicker.
  if (options?.keepSelection || !current)
    return

  await selectionApi.reselect(current.range, current.kind, current.tag)
}

const selectionApi = useSelection(
  () => no.value,
  () => source.content.value,
  // Deleting drops the selection outright, so there is nothing to restore.
  (next, label) => source.setContent(next, label),
)

const gizmo = useTransformGizmo({
  canvas,
  getTarget: () => selection.value,
  getContent: () => source.content.value,
  getNo: () => no.value,
  commit,
  selectThrough: (x, y) => selectionApi.selectThrough(x, y),
})

const context: StudioContext = {
  no: () => no.value,
  content: () => source.content.value,
  frontmatter: () => source.frontmatter.value,
  note: () => source.note.value,
  canvas,
  gizmo,
  commit,
  setFrontmatter: (values, label) => source.setFrontmatter(values, label),
  setNote: note => source.setNote(note),
  range: () => selection.value?.range ?? null,
  selectInserted: tag => selectionApi.selectInserted(tag),
  selectThrough: (x, y) => selectionApi.selectThrough(x, y),
  go: target => nav.go(target),
}

provide(studioKey, context)

// Also outside the component tree, for Slidev's setup files: the context menu
// is built there and has no way to inject.
studioContext.value = context
onScopeDispose(() => (studioContext.value = null))

// Selection belongs to one slide; navigating away drops it.
watch(no, () => (selection.value = null))

// `useDynamicSlideInfo` fetches the slide source lazily, on first read. Touch
// it here so the source is already in hand when the user clicks, rather than
// the first click of every slide being the one that starts the request.
watchEffect(() => void source.info.value)

// Push the deck aside so the dock never covers what is being edited.
const viewport = useWindowSize()

watchEffect(() => {
  const root = document.documentElement
  root.classList.toggle('slidev-studio-docked', studioOpen.value)

  if (!studioOpen.value) {
    root.style.removeProperty('--studio-dock-width')
    root.style.removeProperty('--studio-deck-scale')
    root.style.removeProperty('--studio-deck-offset')
    return
  }

  const scale = Math.max(0.3, (viewport.width.value - dockWidth.value) / viewport.width.value)
  root.style.setProperty('--studio-dock-width', `${dockWidth.value}px`)
  root.style.setProperty('--studio-deck-scale', String(scale))
  root.style.setProperty('--studio-deck-offset', `${((1 - scale) * viewport.height.value) / 2}px`)
})

</script>

<template>
  <!--
    Teleported to `body` on purpose. Studio scales the deck down with a CSS
    transform to make room for the dock, and a transform makes its subtree the
    containing block for `position: fixed`. Left where Slidev mounts global
    layers, the editor's own chrome would be scaled and clipped along with the
    slide.
  -->
  <Teleport to="body">
    <div class="slidev-studio">
      <StudioToolbar />
      <template v-if="studioOpen">
        <SelectionLayer />
        <InlineEditor />
        <StudioDock />
      </template>
      <div v-if="lastError" class="studio-toast">
        {{ lastError }}
      </div>
    </div>
  </Teleport>
</template>
