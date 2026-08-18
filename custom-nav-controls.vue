<script setup lang="ts">
import { computed } from 'vue'
import { useNav } from '@slidev/client'
import { studioOpen } from './client/state'
import StudioIcon from './client/ui/parts/StudioIcon.vue'

const nav = useNav()
const available = computed(() => __DEV__ && __SLIDEV_FEATURE_EDITOR__ && !nav.isPrintMode.value)
</script>

<template>
  <button
    v-if="available"
    class="slidev-icon-btn"
    :class="{ 'text-primary': studioOpen }"
    title="Toggle Studio (E)"
    @click="studioOpen = !studioOpen"
  >
    <StudioIcon name="edit" :size="18" />
  </button>
</template>
