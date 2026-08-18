<script setup lang="ts">
import type { CatalogComponent } from '../../types'
import { ref } from 'vue'
import { onDomEvent } from '../../composables/useDomEvent'
import { CANVAS_SELECTOR } from '../../dom'
import { useCatalog } from '../../composables/useCatalog'
import { useStudio } from '../../context'
import { insertSnippet, positioned } from '../../md/insert'
import { selection } from '../../state'
import ComponentPreview from '../parts/ComponentPreview.vue'

/**
 * The component palette: everything this deck can actually use, gathered from
 * Slidev's builtins, the active theme, every addon, and the project itself.
 *
 * Clicking inserts into the flow after whatever is selected. Dragging onto the
 * canvas inserts at the drop point as a free-positioned element.
 */
const studio = useStudio()
const { query, groups, sources, toggleSource } = useCatalog()

const dragging = ref<CatalogComponent | null>(null)

const sourceFilters = [
  { id: 'project', label: 'Project' },
  { id: 'theme', label: 'Theme' },
  { id: 'addon', label: 'Addons' },
  { id: 'builtin', label: 'Slidev' },
] as const

async function insert(component: CatalogComponent) {
  const range = selection.value?.range
  await studio.commit(
    insertSnippet(studio.content(), component.snippet, range ? { mode: 'after', range } : { mode: 'append' }),
    `Insert ${component.name}`,
  )
}

onDomEvent<DragEvent>(window, 'dragover', (event) => {
  if (dragging.value && (event.target as Element)?.closest?.(CANVAS_SELECTOR))
    event.preventDefault()
})

onDomEvent<DragEvent>(window, 'drop', async (event) => {
  const component = dragging.value
  dragging.value = null
  if (!component || !(event.target as Element)?.closest?.(CANVAS_SELECTOR))
    return

  event.preventDefault()
  const point = studio.canvas.toCanvas(event.clientX, event.clientY)
  const snippet = positioned(component.snippet, { x: Math.round(point.x), y: Math.round(point.y), w: 260, h: null, rotate: 0 })
  await studio.commit(insertSnippet(studio.content(), snippet, { mode: 'append' }), `Place ${component.name}`)
})
</script>

<template>
  <div class="studio-catalog__search">
    <input v-model="query" type="text" placeholder="Search components…">
    <div class="studio-segmented" style="margin-top: 8px">
      <button
        v-for="filter in sourceFilters"
        :key="filter.id"
        type="button"
        :aria-pressed="sources.has(filter.id)"
        @click="toggleSource(filter.id)"
      >
        {{ filter.label }}
      </button>
    </div>
  </div>

  <div v-if="!groups.length" class="studio-empty">
    No components match.
  </div>

  <section v-for="[group, items] in groups" :key="group">
    <h3 class="studio-section__title" style="padding: 12px 12px 0">
      {{ group }}
    </h3>
    <div class="studio-grid">
      <button
        v-for="component in items"
        :key="component.name"
        class="studio-card"
        draggable="true"
        :title="component.description ?? component.name"
        @click="insert(component)"
        @dragstart="dragging = component"
        @dragend="dragging = null"
      >
        <ComponentPreview :component="component" />
        <span class="studio-card__label">
          <span class="studio-card__name">{{ component.name }}</span>
          <span v-if="component.description" class="studio-card__meta">{{ component.description }}</span>
        </span>
      </button>
    </div>
  </section>

  <p class="studio-hint" style="padding: 0 12px 16px">
    Click to add after the selection, or drag onto the slide to place it freely.
  </p>
</template>
