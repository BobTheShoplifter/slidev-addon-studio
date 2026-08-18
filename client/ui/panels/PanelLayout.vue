<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useCatalog } from '../../composables/useCatalog'
import { useStudio } from '../../context'
import StudioField from '../parts/StudioField.vue'

/**
 * Slide-level settings: the layout it uses and the frontmatter keys that
 * change how the whole slide looks. These write to the slide's frontmatter,
 * which Slidev patches key by key, so untouched keys keep their formatting.
 */
const studio = useStudio()
const { layouts } = useCatalog()

const frontmatter = computed(() => studio.frontmatter())
const currentLayout = computed(() => frontmatter.value.layout ?? (studio.no() === 1 ? 'cover' : 'default'))

const note = ref('')
watch(() => studio.note(), value => (note.value = value), { immediate: true })

function set(key: string, value: unknown) {
  return studio.setFrontmatter({ [key]: value === '' ? null : value }, `Set ${key}`)
}
</script>

<template>
  <section class="studio-section">
    <h3 class="studio-section__title">
      Layout
    </h3>
    <div class="studio-grid" style="padding: 0">
      <button
        v-for="layout in layouts"
        :key="layout.name"
        class="studio-card"
        :class="{ 'studio-card--active': layout.name === currentLayout }"
        :title="layout.description ?? `${layout.name} (${layout.origin})`"
        @click="set('layout', layout.name)"
      >
        <span class="studio-card__label">
          <span class="studio-card__name">{{ layout.name }}</span>
          <span class="studio-card__meta">{{ layout.origin }}</span>
        </span>
      </button>
    </div>
  </section>

  <section class="studio-section">
    <h3 class="studio-section__title">
      Slide
    </h3>
    <StudioField label="Title">
      <input type="text" :value="frontmatter.title ?? ''" placeholder="From the first heading" @change="set('title', ($event.target as HTMLInputElement).value)">
    </StudioField>
    <StudioField label="Classes">
      <input type="text" :value="frontmatter.class ?? ''" placeholder="dark text-center" @change="set('class', ($event.target as HTMLInputElement).value)">
    </StudioField>
    <StudioField label="Background">
      <input type="text" :value="frontmatter.background ?? ''" placeholder="/cover.png or #101014" @change="set('background', ($event.target as HTMLInputElement).value)">
    </StudioField>
    <StudioField label="Zoom">
      <input type="number" step="0.05" min="0.2" max="3" :value="frontmatter.zoom ?? 1" @change="set('zoom', +($event.target as HTMLInputElement).value)">
    </StudioField>
    <StudioField label="Clicks">
      <input
        type="number"
        min="0"
        :value="frontmatter.clicks ?? ''"
        placeholder="auto"
        title="Force a number of click steps, e.g. to hold on the last one"
        @change="set('clicks', ($event.target as HTMLInputElement).value ? +($event.target as HTMLInputElement).value : '')"
      >
    </StudioField>
    <StudioField label="Hide">
      <select :value="frontmatter.hide ? 'yes' : 'no'" @change="set('hide', ($event.target as HTMLSelectElement).value === 'yes' ? true : null)">
        <option value="no">
          Show in the deck
        </option>
        <option value="yes">
          Skip this slide
        </option>
      </select>
    </StudioField>
  </section>

  <section class="studio-section">
    <h3 class="studio-section__title">
      Presenter notes
    </h3>
    <textarea v-model="note" rows="6" spellcheck="false" @change="studio.setNote(note)" />
  </section>
</template>
