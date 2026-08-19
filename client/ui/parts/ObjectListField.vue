<script setup lang="ts">
import type { ObjectRow, Primitive } from '../../md/literals'
import { computed } from 'vue'
import StudioIcon from './StudioIcon.vue'

/**
 * Editing an array of objects as rows of fields.
 *
 * A timeline's entries and a terminal demo's steps are lists of small records,
 * and the useful shape of them is a table: one row per entry, one input per
 * field. Editing that as a single quoted blob is the worst version of it.
 *
 * The columns come from the rows themselves, and from the shape the component
 * declares, so an empty list still knows what fields it wants.
 */
const props = defineProps<{
  label: string
  rows: ObjectRow[]
  /** Field names declared by the component's element type. */
  fields?: { name: string, type?: string }[]
}>()

const emit = defineEmits<{ change: [rows: ObjectRow[]] }>()

const columns = computed(() => {
  const names = new Set<string>()
  for (const field of props.fields ?? [])
    names.add(field.name)
  for (const row of props.rows)
    Object.keys(row).forEach(key => names.add(key))
  return [...names]
})

function typeOf(name: string) {
  const declared = props.fields?.find(f => f.name === name)?.type ?? ''
  if (/boolean/i.test(declared))
    return 'boolean'
  if (/number/i.test(declared))
    return 'number'
  // Fall back to whatever the existing rows actually hold.
  const sample = props.rows.map(row => row[name]).find(value => value !== undefined)
  return typeof sample === 'boolean' ? 'boolean' : typeof sample === 'number' ? 'number' : 'text'
}

function update(index: number, key: string, raw: string | boolean) {
  const next = props.rows.map(row => ({ ...row }))
  const kind = typeOf(key)
  let value: Primitive = raw as Primitive
  if (kind === 'number' && typeof raw === 'string')
    value = raw === '' ? '' : Number(raw)
  next[index][key] = value
  emit('change', next)
}

function remove(index: number) {
  emit('change', props.rows.filter((_, i) => i !== index))
}

function move(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= props.rows.length)
    return
  const next = props.rows.map(row => ({ ...row }))
  ;[next[index], next[target]] = [next[target], next[index]]
  emit('change', next)
}

function add() {
  const blank: ObjectRow = {}
  for (const name of columns.value)
    blank[name] = typeOf(name) === 'boolean' ? false : ''
  emit('change', [...props.rows, blank])
}
</script>

<template>
  <div class="studio-field studio-field--stacked">
    <span class="studio-field__label">{{ label }}</span>

    <div class="studio-list">
      <div v-for="(row, index) in rows" :key="index" class="studio-row">
        <div class="studio-row__header">
          <span class="studio-card__meta">{{ index + 1 }}</span>
          <span class="studio-row__actions">
            <button class="studio-icon-button" title="Move up" :disabled="index === 0" @click="move(index, -1)">
              <StudioIcon name="up" :size="13" />
            </button>
            <button class="studio-icon-button" title="Move down" :disabled="index === rows.length - 1" @click="move(index, 1)">
              <StudioIcon name="down" :size="13" />
            </button>
            <button class="studio-icon-button" title="Remove" @click="remove(index)">
              <StudioIcon name="close" :size="13" />
            </button>
          </span>
        </div>

        <label v-for="name in columns" :key="name" class="studio-field">
          <span class="studio-field__label">{{ name }}</span>
          <span class="studio-field__control">
            <select
              v-if="typeOf(name) === 'boolean'"
              :value="row[name] === true ? 'yes' : 'no'"
              @change="update(index, name, ($event.target as HTMLSelectElement).value === 'yes')"
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
            <input
              v-else
              :type="typeOf(name) === 'number' ? 'number' : 'text'"
              :value="row[name] ?? ''"
              @change="update(index, name, ($event.target as HTMLInputElement).value)"
            >
          </span>
        </label>
      </div>

      <p v-if="!rows.length" class="studio-hint" style="margin: 0 0 6px">
        Empty list.
      </p>

      <button class="studio-button" @click="add">
        <StudioIcon name="plus" :size="13" /> Add {{ label.toLowerCase().replace(/s$/, '') }}
      </button>
    </div>
  </div>
</template>
