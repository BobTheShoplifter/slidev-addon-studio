<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue'

/**
 * Palette previews render components written for a real slide, which may
 * legitimately fail without one. A broken preview must never take the editor
 * or the deck, down with it.
 */
const failed = ref(false)

onErrorCaptured(() => {
  failed.value = true
  return false
})
</script>

<template>
  <slot v-if="!failed" />
  <span v-else class="studio-card__meta"><slot name="fallback">No preview</slot></span>
</template>
