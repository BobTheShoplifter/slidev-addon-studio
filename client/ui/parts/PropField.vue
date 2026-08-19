<script setup lang="ts">
import type { PropControl, PropMeta } from '../../types'
import { computed } from 'vue'
import { formatObjectArray, formatStringArray, isArrayType, isColorValue, parseObjectArray, parseStringArray } from '../../md/literals'
import { isBoolean, isNumber, isTruthyDefault } from '../../md/props'
import ColorSwatch from './ColorSwatch.vue'
import ListField from './ListField.vue'
import ObjectListField from './ObjectListField.vue'
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

/** Rows, when the value is a list of records rather than of strings. */
const rows = computed(() => parseObjectArray(current.value) ?? defaultRows.value)

const defaultRows = computed(() => {
  if (current.value || !props.prop.default)
    return null
  const literal = props.prop.default.match(/\[[\s\S]*\]/)?.[0]
  return literal ? parseObjectArray(literal) : null
})

// An unset boolean shows what the component will actually do, which for a prop
// defaulting to true is "yes". Showing "no" made it look already off, and
// choosing "no" then fired no change event at all.
const booleanValue = computed(() => (props.value === null ? isTruthyDefault(props.prop) : props.value === true))

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
  if (isArrayType(props.prop.type)) {
    const element = (props.prop.type ?? '').replace(/\[\]$/, '').trim()
    const isStringList = element === 'string' || /^'/.test(element)

    // A list of records is edited as rows of fields, which needs either rows to
    // read or a declared shape to build one from.
    if (!isStringList && (rows.value?.length || props.prop.fields?.length))
      return 'object[]'
    if (!isStringList && !looksLikeColors.value)
      return 'text'
    return items.value ? (looksLikeColors.value ? 'color[]' : 'list') : 'text'
  }
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

function setRows(next: Record<string, string | number | boolean>[]) {
  emit('change', formatObjectArray(next))
}
</script>

<template>
  <ObjectListField
    v-if="control === 'object[]'"
    :label="label"
    :rows="rows ?? []"
    :fields="prop.fields"
    @change="setRows"
  />

  <ListField
    v-else-if="control === 'list' || control === 'color[]'"
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
    <select :value="booleanValue ? 'yes' : 'no'" @change="emit('change', ($event.target as HTMLSelectElement).value === 'yes')">
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
