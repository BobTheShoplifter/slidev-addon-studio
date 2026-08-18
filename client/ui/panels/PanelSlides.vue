<script setup lang="ts">
import { useNav } from '@slidev/client'
import { computed } from 'vue'
import { deckApi } from '../../composables/useDeckApi'
import { useStudio } from '../../context'
import StudioIcon from '../parts/StudioIcon.vue'

/**
 * The deck outline.
 *
 * Adding, removing and reordering slides rewrites the Markdown file itself,
 * which Slidev's per-slide endpoint cannot do, so these go through Studio's
 * own dev API and come back as a normal file change.
 */
const studio = useStudio()
const nav = useNav()

const slides = computed(() => nav.slides.value)

/** Titles are taken from the Markdown heading, so they can carry inline HTML. */
function titleOf(slide: (typeof nav.slides.value)[number]) {
  const raw = slide.meta.slide.title
  const plain = raw?.replace(/<[^>]*>/g, '').trim()
  return plain || slide.meta.slide.frontmatter.layout || 'Untitled'
}

async function run(action: Promise<{ no: number } | null>) {
  const result = await action
  if (result)
    nav.go(result.no)
}

const add = (after: number) => run(deckApi.insert(after))
const duplicate = (no: number) => run(deckApi.duplicate(no))
const remove = (no: number) => run(deckApi.remove(no))
const move = (no: number, to: number) => run(deckApi.move(no, to))
</script>

<template>
  <div>
    <button
      v-for="slide in slides"
      :key="slide.no"
      class="studio-slide-row"
      :aria-current="slide.no === studio.no()"
      @click="nav.go(slide.no)"
    >
      <span class="studio-slide-row__no">{{ slide.no }}</span>
      <span class="studio-slide-row__title">
        {{ titleOf(slide) }}
      </span>
      <span class="studio-slide-row__actions">
        <span
          class="studio-icon-button"
          role="button"
          title="Move up"
          @click.stop="move(slide.no, slide.no - 1)"
        >
          <StudioIcon name="up" :size="14" />
        </span>
        <span
          class="studio-icon-button"
          role="button"
          title="Move down"
          @click.stop="move(slide.no, slide.no + 1)"
        >
          <StudioIcon name="down" :size="14" />
        </span>
        <span
          class="studio-icon-button"
          role="button"
          title="Duplicate"
          @click.stop="duplicate(slide.no)"
        >
          <StudioIcon name="copy" :size="14" />
        </span>
        <span
          class="studio-icon-button"
          role="button"
          title="Delete"
          @click.stop="remove(slide.no)"
        >
          <StudioIcon name="trash" :size="14" />
        </span>
      </span>
    </button>

    <div class="studio-section">
      <button class="studio-button" @click="add(studio.no())">
        <StudioIcon name="plus" :size="14" /> Add slide after {{ studio.no() }}
      </button>
      <p class="studio-hint">
        Slides imported from another file with <code>src:</code> can be reordered only within that file.
      </p>
    </div>
  </div>
</template>
