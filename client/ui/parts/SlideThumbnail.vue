<script setup lang="ts">
import type { SlideRoute } from '@slidev/types'
import { computed, onErrorCaptured, ref } from 'vue'
import { slideHeight, slideWidth } from '@slidev/client/env.ts'
import { createFixedClicks } from '@slidev/client/composables/useClicks.ts'
import SlideWrapper from '@slidev/client/internals/SlideWrapper.vue'
import { useDeckPaint } from '../../composables/useDeckPaint'

/**
 * A slide rendered small.
 *
 * This mounts the real slide component rather than an image, which is what
 * Slidev's own overview does, so a thumbnail is always current and costs no
 * capture step. `previewNext` is the render context Slidev uses for exactly
 * this, and it keeps click animations from advancing in the panel.
 */
const props = defineProps<{ route: SlideRoute, width?: number }>()

const THUMBNAIL_WIDTH = 132
const failed = ref(false)

const paint = useDeckPaint()
const width = computed(() => props.width ?? THUMBNAIL_WIDTH)
const scale = computed(() => width.value / slideWidth.value)
const boxStyle = computed(() => ({
  width: `${width.value}px`,
  height: `${scale.value * slideHeight.value}px`,
  ...paint.value,
}))
const stageStyle = computed(() => ({
  width: `${slideWidth.value}px`,
  height: `${slideHeight.value}px`,
  transform: `scale(${scale.value})`,
}))

const clicks = createFixedClicks(props.route, 0)

onErrorCaptured(() => {
  failed.value = true
  return false
})
</script>

<template>
  <div class="studio-thumb-slide" :style="boxStyle">
    <div v-if="!failed" class="studio-thumb-slide__stage" :style="stageStyle">
      <SlideWrapper :clicks-context="clicks" :route="route" render-context="previewNext" />
    </div>
  </div>
</template>
