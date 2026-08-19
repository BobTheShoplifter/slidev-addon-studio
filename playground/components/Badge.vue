<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  tone?: 'accent' | 'muted'
}>(), { tone: 'accent' })
</script>

<template>
  <span class="badge" :class="`badge--${tone}`">{{ label }}</span>
</template>

<style scoped>
.badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.75em;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.badge--accent {
  color: #fff;
  background: #4f8cff;
}

.badge--muted {
  color: #444;
  background: #e6e7ea;
}
</style>

<studio lang="yaml">
description: A small rounded label
category: Playground
snippet: |
  <Badge label="new" />
</studio>
