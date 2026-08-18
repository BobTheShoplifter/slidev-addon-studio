<script setup lang="ts">
import { computed } from 'vue'
import { useNav } from '@slidev/client'
import StudioRoot from './client/ui/StudioRoot.vue'

/**
 * Studio only exists while `slidev` is running with the editor enabled. In
 * build, export and print modes this renders nothing, so a published deck
 * carries none of it.
 */
const nav = useNav()

const available = computed(() =>
  __DEV__
  && __SLIDEV_FEATURE_EDITOR__
  && !nav.isPrintMode.value
  && !nav.isEmbedded.value
  && !nav.isNotesViewer.value,
)
</script>

<template>
  <StudioRoot v-if="available" />
</template>
