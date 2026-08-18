<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { requestReload } from '../../composables/useDeckApi'
import { useCatalog } from '../../composables/useCatalog'
import { useStudio } from '../../context'
import LayoutPreview from '../parts/LayoutPreview.vue'
import PropField from '../parts/PropField.vue'
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

/**
 * A layout takes its props from the slide's frontmatter, so this is a form over
 * frontmatter rather than over markup. On a slide like `layout: fact`, whose
 * entire visible text is `value` and `label`, it is the only way to edit it:
 * that text never passed through Markdown, so there is nothing on the canvas to
 * click.
 */
const layoutProps = computed(() => {
  const active = layouts.find(l => l.name === currentLayout.value)
  return (active?.props ?? []).filter(p => !p.hidden && !RESERVED.has(p.name))
})

/** Keys Slidev owns, already offered below under Slide. */
const RESERVED = new Set(['title', 'class', 'clicks', 'hide', 'level', 'layout', 'transition', 'zoom', 'preload', 'src', 'routeAlias'])

function propValue(name: string) {
  const value = frontmatter.value[name]
  return value === undefined || value === null ? null : String(value)
}

async function setProp(prop: { name: string, type?: string }, value: string | boolean | null) {
  await studio.setFrontmatter({ [prop.name]: coerce(prop.type, value) }, `Set ${prop.name}`)
}

/** Frontmatter is YAML, so a number should land as a number, not a string. */
function coerce(type: string | undefined, value: string | boolean | null) {
  if (value === null || value === '')
    return null
  if (typeof value === 'boolean')
    return value
  const kind = (type ?? '').toLowerCase()
  if (kind.includes('number') && !kind.includes('string') && value.trim() !== '' && !Number.isNaN(Number(value)))
    return Number(value)
  return value
}

const note = ref('')
watch(() => studio.note(), value => (note.value = value), { immediate: true })

async function set(key: string, value: unknown) {
  await studio.setFrontmatter({ [key]: value === '' ? null : value }, `Set ${key}`)
  // The layout is compiled into the slide, so switching it needs a rebuild.
  if (key === 'layout')
    await requestReload()
}
</script>

<template>
  <section class="studio-section">
    <h3 class="studio-section__title">
      Layout
    </h3>
    <div class="studio-grid studio-grid--thumbnails" style="padding: 0">
      <button
        v-for="layout in layouts"
        :key="layout.name"
        class="studio-card"
        :class="{ 'studio-card--active': layout.name === currentLayout }"
        :title="layout.description ?? `${layout.name} (${layout.origin})`"
        @click="set('layout', layout.name)"
      >
        <LayoutPreview :layout="layout" :frontmatter="frontmatter" />
        <span class="studio-card__label">
          <span class="studio-card__name">{{ layout.name }}</span>
          <span class="studio-card__meta">{{ layout.origin }}</span>
        </span>
      </button>
    </div>
  </section>

  <section v-if="layoutProps.length" class="studio-section">
    <h3 class="studio-section__title">
      {{ currentLayout }} options
    </h3>
    <PropField
      v-for="prop in layoutProps"
      :key="prop.name"
      :prop="prop"
      :value="propValue(prop.name)"
      @change="setProp(prop, $event)"
    />
    <p class="studio-hint">
      These are frontmatter keys the layout reads.
    </p>
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
