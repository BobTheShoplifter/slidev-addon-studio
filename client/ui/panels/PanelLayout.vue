<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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

/**
 * Thumbnails read better as this slide under another layout than as a generic
 * diagram, so they borrow the slide's own heading and first line of prose.
 * Taken from the Markdown rather than the DOM, which keeps it reactive and
 * costs nothing when the slide changes.
 */
const sample = computed(() => {
  const lines = studio.content().split(/\r?\n/)
  const heading = lines.find(line => /^#{1,3}\s+\S/.test(line))
  const body = lines.find(line => /^[A-Za-z(\u00C0-\u024F"']/.test(line.trim()) && !/^#{1,6}\s/.test(line.trim()))
  const clip = (text: string, max: number) => {
    const flat = text.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim()
    return flat.length > max ? `${flat.slice(0, max).trimEnd()}\u2026` : flat
  }
  return {
    title: heading ? clip(heading.replace(/^#+\s*/, ''), 60) : 'Slide title',
    body: body ? clip(body, 120) : 'Body text sits here, so the shape of the layout is visible.',
  }
})

/** Keys Slidev owns, already offered below under Slide. */
const RESERVED = new Set(['title', 'class', 'clicks', 'hide', 'level', 'layout', 'transition', 'zoom', 'preload', 'src', 'routeAlias'])

function propValue(name: string): string | boolean | null {
  const value = frontmatter.value[name]
  if (value === undefined || value === null)
    return null
  // Booleans must stay booleans: stringified, `stroke: true` read as the text
  // "true", the control showed "No", and choosing "No" changed nothing.
  return typeof value === 'boolean' ? value : String(value)
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

/**
 * Skipping a slide is a one way door from in here.
 *
 * Slidev drops hidden slides from the deck, so the slide loses its number the
 * moment this is written: the editor cannot show it, the Slides panel cannot
 * list it, and the control could not be set back. Studio moves to the
 * neighbouring slide rather than sitting on one that no longer exists.
 */
async function hide(skip: boolean) {
  const previous = Math.max(1, studio.no() - 1)
  await set('hide', skip ? true : null)
  if (skip)
    studio.go(previous)
}

function set(key: string, value: unknown) {
  return studio.setFrontmatter({ [key]: value === '' ? null : value }, `Set ${key}`)
}

/**
 * An emptied number field means "unset", not zero. Coercing the empty string
 * with `+` wrote `zoom: 0`, which renders the slide as nothing at all.
 */
function numberOrNull(value: string) {
  return value.trim() === '' ? null : Number(value)
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
        <LayoutPreview :layout="layout" :frontmatter="frontmatter" :sample="sample" />
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
      <input type="number" step="0.05" min="0.2" max="3" :value="frontmatter.zoom ?? 1" @change="set('zoom', numberOrNull(($event.target as HTMLInputElement).value))">
    </StudioField>
    <StudioField label="Clicks">
      <input
        type="number"
        min="0"
        :value="frontmatter.clicks ?? ''"
        placeholder="auto"
        title="Force a number of click steps, e.g. to hold on the last one"
        @change="set('clicks', numberOrNull(($event.target as HTMLInputElement).value))"
      >
    </StudioField>
    <StudioField label="Hide">
      <select :value="frontmatter.hide ? 'yes' : 'no'" @change="hide(($event.target as HTMLSelectElement).value === 'yes')">
        <option value="no">
          Show in the deck
        </option>
        <option value="yes">
          Skip this slide
        </option>
      </select>
    </StudioField>
    <p class="studio-hint">
      A skipped slide leaves the deck entirely, so the editor cannot reach it
      again: delete <code>hide: true</code> in the Markdown to bring it back.
    </p>
  </section>

  <section class="studio-section">
    <h3 class="studio-section__title">
      Presenter notes
    </h3>
    <textarea v-model="note" rows="6" spellcheck="false" @change="studio.setNote(note)" />
  </section>
</template>
