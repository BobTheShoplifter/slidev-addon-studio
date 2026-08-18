<script setup lang="ts">
import ColorSwatch from './ColorSwatch.vue'
import StudioIcon from './StudioIcon.vue'

/**
 * Editing an array prop as a list, with each entry on its own row.
 *
 * Arrays in a deck are almost always a list of things a human wrote: poll
 * options, the tells in a phishing example, a palette. Editing them as one long
 * quoted string is the worst version of that, so they get rows, an add button
 * and a remove button.
 */
const props = defineProps<{
  label: string
  items: string[]
  /** Render each entry as a colour rather than plain text. */
  color?: boolean
  /** Values offered as one-click additions. */
  options?: string[]
}>()

const emit = defineEmits<{ change: [items: string[]] }>()

function update(index: number, value: string) {
  const next = [...props.items]
  next[index] = value
  emit('change', next)
}

function remove(index: number) {
  emit('change', props.items.filter((_, i) => i !== index))
}

function move(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= props.items.length)
    return
  const next = [...props.items]
  ;[next[index], next[target]] = [next[target], next[index]]
  emit('change', next)
}

function add(value = '') {
  emit('change', [...props.items, value])
}
</script>

<template>
  <div class="studio-field studio-field--stacked">
    <span class="studio-field__label">{{ label }}</span>

    <div class="studio-list">
      <div v-for="(item, index) in items" :key="index" class="studio-list__row">
        <ColorSwatch v-if="color" :value="item" @change="update(index, $event)" />
        <input v-else type="text" :value="item" @change="update(index, ($event.target as HTMLInputElement).value)">

        <button class="studio-icon-button" title="Move up" :disabled="index === 0" @click="move(index, -1)">
          <StudioIcon name="up" :size="13" />
        </button>
        <button class="studio-icon-button" title="Move down" :disabled="index === items.length - 1" @click="move(index, 1)">
          <StudioIcon name="down" :size="13" />
        </button>
        <button class="studio-icon-button" title="Remove" @click="remove(index)">
          <StudioIcon name="close" :size="13" />
        </button>
      </div>

      <p v-if="!items.length" class="studio-hint" style="margin: 0 0 6px">
        Empty list.
      </p>

      <div v-if="options?.length" class="studio-list__options">
        <button v-for="option in options" :key="option" class="studio-chip" @click="add(option)">
          <span v-if="color" class="studio-color__swatch" :style="{ background: option }" />
          {{ option }}
        </button>
      </div>

      <button class="studio-button" @click="add()">
        <StudioIcon name="plus" :size="13" /> Add
      </button>
    </div>
  </div>
</template>
