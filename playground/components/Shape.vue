<!-- @studio
description: A shape from the deck's own asset folder
category: Playground
props:
  name:
    label: Shape
    options:
      files: ./shapes/*.svg
  size:
    label: Size (px)
  caption:
    label: Caption
-->
<script setup lang="ts">
import { computed } from 'vue'
/**
 * Shape - demonstrates prop options backed by files.
 *
 *   <Shape name="hexagon" :size="160" caption="A hexagon" />
 */
const props = withDefaults(defineProps<{
  name: string
  size?: number
  caption?: string
}>(), { size: 140, caption: '' })

const urls = import.meta.glob('./shapes/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const src = computed(() => urls[`./shapes/${props.name}.svg`])
</script>

<template>
  <figure class="shape">
    <img v-if="src" :src="src" :alt="name" :width="size" :height="size">
    <figcaption v-if="caption">{{ caption }}</figcaption>
  </figure>
</template>

<style scoped>
.shape {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5em;
  margin: 0;
}

figcaption {
  font-size: 0.8em;
  opacity: 0.7;
}
</style>
