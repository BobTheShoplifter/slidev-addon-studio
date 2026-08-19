<script setup lang="ts">
import { useNav } from '@slidev/client'
import { useLocalStorage } from '@vueuse/core'
import { computed, ref } from 'vue'
import { deckApi } from '../../composables/useDeckApi'
import { onDomEvent } from '../../composables/useDomEvent'
import { useStudioHistory } from '../../composables/useSlideSource'
import { clearSelection } from '../../state'
import { useStudio } from '../../context'
import SlideThumbnail from '../parts/SlideThumbnail.vue'
import StudioIcon from '../parts/StudioIcon.vue'

/**
 * The deck outline.
 *
 * Adding, removing and reordering slides rewrites the Markdown file itself,
 * which Slidev's per-slide endpoint cannot do, so these go through Studio's own
 * dev API and come back as a normal file change.
 */
const studio = useStudio()
const nav = useNav()
const history = useStudioHistory()

const slides = computed(() => nav.slides.value)
const showThumbnails = useLocalStorage('slidev-studio:slide-thumbnails', true)

/** Titles are taken from the Markdown heading, so they can carry inline HTML. */
function titleOf(slide: (typeof nav.slides.value)[number]) {
  const raw = slide.meta.slide.title
  const plain = raw?.replace(/<[^>]*>/g, '').trim()
  return plain || slide.meta.slide.frontmatter.layout || 'Untitled'
}

const busy = ref(false)

async function run(action: Promise<{ no: number } | null>) {
  busy.value = true
  try {
    const result = await action
    if (!result)
      return

    // Undo replays a whole slide by its number, and adding, duplicating,
    // removing or moving a slide renumbers everything after it: replaying an
    // older entry would then write that slide's text over a different slide.
    // The history is dropped rather than left pointing at the wrong slides.
    history.reset()
    clearSelection()

    // A change to the deck's shape rebuilds the page, because Slidev's own
    // reload only refreshes slides it already knows and a new one came back
    // showing whatever used to carry that number. The address is put on the
    // new slide first, so the editor comes back where the action pointed:
    // `go` alone would clamp, since this browser still thinks the deck is
    // one slide shorter.
    const path = window.location.pathname.replace(/\/\d+$/, `/${result.no}`)
    window.history.replaceState(null, '', path + window.location.search)
    nav.go(Math.min(result.no, nav.total.value))
  }
  finally {
    busy.value = false
  }
}

const add = (after: number) => run(deckApi.insert(after))
const duplicate = (no: number) => run(deckApi.duplicate(no))
const remove = (no: number) => run(deckApi.remove(no))
const move = (no: number, to: number) => run(deckApi.move(no, to))

/*
 * Dragging a slide is the natural way to reorder one, and clicking an arrow
 * eleven times is not. The drop target is tracked per row so the list shows
 * where the slide will land.
 */
const dragging = ref<number | null>(null)
const over = ref<number | null>(null)

function onDragStart(no: number) {
  dragging.value = no
}

function onDragOver(no: number) {
  if (dragging.value !== null && dragging.value !== no)
    over.value = no
}

async function onDrop(no: number) {
  const from = dragging.value
  dragging.value = null
  over.value = null
  if (from === null || from === no)
    return
  await move(from, no)
}

onDomEvent(window, 'dragend', () => {
  dragging.value = null
  over.value = null
})
</script>

<template>
  <div>
    <div class="studio-section" style="display: flex; align-items: center; justify-content: space-between; gap: 8px">
      <span class="studio-card__meta">{{ slides.length }} slides</span>
      <button
        class="studio-icon-button"
        :aria-pressed="showThumbnails"
        title="Show thumbnails"
        @click="showThumbnails = !showThumbnails"
      >
        <StudioIcon :name="showThumbnails ? 'slides' : 'flow'" />
      </button>
    </div>

    <button
      v-for="slide in slides"
      :key="slide.no"
      class="studio-slide-row"
      :class="{
        'studio-slide-row--thumb': showThumbnails,
        'studio-slide-row--over': over === slide.no,
        'studio-slide-row--dragging': dragging === slide.no,
      }"
      :aria-current="slide.no === studio.no()"
      draggable="true"
      @click="nav.go(slide.no)"
      @dragstart="onDragStart(slide.no)"
      @dragover.prevent="onDragOver(slide.no)"
      @drop.prevent="onDrop(slide.no)"
    >
      <span class="studio-slide-row__no">{{ slide.no }}</span>

      <SlideThumbnail v-if="showThumbnails" :route="slide" />

      <span class="studio-slide-row__title">
        {{ titleOf(slide) }}
      </span>

      <span class="studio-slide-row__actions">
        <span class="studio-icon-button" role="button" title="Duplicate" @click.stop="duplicate(slide.no)">
          <StudioIcon name="copy" :size="14" />
        </span>
        <span class="studio-icon-button" role="button" title="Delete" @click.stop="remove(slide.no)">
          <StudioIcon name="trash" :size="14" />
        </span>
      </span>
    </button>

    <div class="studio-section">
      <button class="studio-button" :disabled="busy" @click="add(studio.no())">
        <StudioIcon name="plus" :size="14" /> Add slide after {{ studio.no() }}
      </button>
      <p class="studio-hint">
        Drag a slide to reorder it. Slides imported from another file with
        <code>src:</code> can only move within that file.
      </p>
    </div>
  </div>
</template>
