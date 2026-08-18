<script setup lang="ts">
import { computed } from 'vue'
import { isColorValue } from '../../md/literals'

/**
 * A colour value as a swatch plus its text.
 *
 * The text stays editable because deck colours are usually theme variables such
 * as `var(--flag-red)`, which no native colour input can express. The swatch is
 * painted with the value itself, so a variable resolves to whatever the theme
 * says it is right now.
 */
const props = defineProps<{ value: string }>()
defineEmits<{ change: [value: string] }>()

const paintable = computed(() => isColorValue(props.value))
</script>

<template>
  <span class="studio-color">
    <span class="studio-color__swatch" :style="paintable ? { background: value } : undefined" />
    <input
      type="text"
      :value="value"
      placeholder="#4f8cff or var(--accent)"
      @change="$emit('change', ($event.target as HTMLInputElement).value)"
    >
  </span>
</template>
