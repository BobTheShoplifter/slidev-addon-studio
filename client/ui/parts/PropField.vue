<script setup lang="ts">
import type { PropControl, PropMeta } from '../../types'
import { computed } from 'vue'
import { formatStringArray, isArrayType, isColorValue, parseStringArray } from '../../md/literals'
import { isBoolean, isNumber } from '../../md/props'
import ColorSwatch from './ColorSwatch.vue'
import ListField from './ListField.vue'
import StudioField from './StudioField.vue'

/**
 * One control in the props editor, chosen from what the prop actually is.
 *
 * Most of the choice is inferred: an array type gets a list editor, a string
 * union a dropdown, options backed by image files a picker of the images. Only
 * colours have to be declared, since nothing about `string` says the string is
 * a colour.
 */
const props = defineProps<{ prop: PropMeta, value: string | boolean | null }>()
const emit = defineEmits<{ change: [value: string | boolean | null] }>()

const label = computed(() => props.prop.label ?? props.prop.name)
const current = computed(() => (props.value === null ? '' : String(props.value)))
const optionValues = computed(() => props.prop.options?.map(o => o.value) ?? [])

const items = computed(() => parseStringArray(current.value) ?? defaultItems.value)

/**
 * A prop with no value written yet still has a default, and for a list that
 * default is usually the interesting thing: `colors` on a poll defaults to the
 * theme's palette. Showing it means the first edit starts from what is actually
 * on screen rather than from nothing.
 */
const defaultItems = computed(() => {
  if (current.value || !props.prop.default)
    return null
  const literal = props.prop.default.match(/\[[\s\S]*\]/)?.[0]
  return literal ? parseStringArray(literal) : null
})

/**
 * Colours are not inferable from a type, but they are perfectly inferable from
 * a value: nothing else looks like `var(--flag-red)` or `#4f8cff`. Declaring
 * `control: color` stays available for an empty prop.
 */
const looksLikeColors = computed(() => {
  const list = items.value
  return !!list?.length && list.every(isColorValue)
})

const control = computed<PropControl>(() => {
  const declared = props.prop.control
  if (declared)
    return declared
  if (props.prop.options?.length)
    return 'select'
  if (isArrayType(props.prop.type))
    // Only offer rows for a list we could actually read back.
    return items.value ? (looksLikeColors.value ? 'color[]' : 'list') : 'text'
  if (current.value && isColorValue(current.value))
    return 'color'
  if (isBoolean(props.prop))
    return 'boolean'
  if (isNumber(props.prop))
    return 'number'
  return 'text'
})

const hasThumbnails = computed(() => props.prop.options?.some(o => o.preview) ?? false)

function setList(next: string[]) {
  emit('change', formatStringArray(next))
}
</script>

<template>
  <ListField
    v-if="control === 'list' || control === 'color[]'"
    :label="label"
    :items="items ?? []"
    :color="control === 'color[]'"
    :options="optionValues"
    @change="setList"
  />

  <StudioField v-else-if="control === 'color'" :label="label">
    <ColorSwatch :value="current" @change="emit('change', $event)" />
  </StudioField>

  <div v-else-if="control === 'select' && hasThumbnails" class="studio-field studio-field--stacked">
    <span class="studio-field__label">{{ label }}</span>
    <div class="studio-thumbs">
      <button
        v-for="option in prop.options"
        :key="option.value"
        class="studio-thumb"
        :class="{ 'studio-thumb--active': option.value === current }"
        :title="option.value"
        @click="emit('change', option.value)"
      >
        <img v-if="option.preview" :src="option.preview" :alt="option.value" loading="lazy">
        <span v-else>{{ option.value }}</span>
      </button>
    </div>
  </div>

  <StudioField v-else-if="control === 'select'" :label="label">
    <select :value="current" @change="emit('change', ($event.target as HTMLSelectElement).value)">
      <option value="">
        {{ prop.required ? 'Choose…' : 'Default' }}
      </option>
      <option v-for="option in prop.options" :key="option.value" :value="option.value">
        {{ option.value }}
      </option>
    </select>
  </StudioField>

  <StudioField v-else-if="control === 'boolean'" :label="label">
    <select :value="value === true ? 'yes' : 'no'" @change="emit('change', ($event.target as HTMLSelectElement).value === 'yes')">
      <option value="no">
        No
      </option>
      <option value="yes">
        Yes
      </option>
    </select>
  </StudioField>

  <StudioField v-else-if="control === 'number'" :label="label">
    <input
      type="number"
      :value="current"
      :placeholder="prop.default ?? ''"
      @change="emit('change', ($event.target as HTMLInputElement).value)"
    >
  </StudioField>

  <StudioField v-else :label="label">
    <input
      type="text"
      :value="current"
      :placeholder="prop.default ?? prop.type ?? ''"
      @change="emit('change', ($event.target as HTMLInputElement).value)"
    >
  </StudioField>
</template>
