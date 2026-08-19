<script setup lang="ts">
/**
 * Milestones - a small timeline, to show how a list of records is edited.
 *
 *   <Milestones :items="[{ year: '2024', text: 'Something happened' }]" />
 */
withDefaults(defineProps<{
  items: { year: string, text: string, highlight?: boolean }[]
  accent?: string
}>(), { accent: 'var(--accent)' })
</script>

<template>
  <ol class="milestones">
    <li v-for="item in items" :key="item.year" :class="{ 'is-highlight': item.highlight }">
      <span class="year" :style="item.highlight ? { color: accent } : undefined">{{ item.year }}</span>
      <span>{{ item.text }}</span>
    </li>
  </ol>
</template>

<style scoped>
.milestones {
  display: flex;
  flex-direction: column;
  gap: 0.5em;
  margin: 1em 0;
  padding: 0;
  list-style: none;
}

li {
  display: flex;
  gap: 1em;
  align-items: baseline;
}

.year {
  min-width: 4em;
  font-variant-numeric: tabular-nums;
  opacity: 0.6;
}

.is-highlight {
  font-weight: 600;
}

.is-highlight .year {
  opacity: 1;
}
</style>

<studio lang="yaml">
description: A small timeline of dated entries
category: Playground
props:
  items:
    label: Milestones
  accent:
    label: Highlight colour
    control: color
</studio>
