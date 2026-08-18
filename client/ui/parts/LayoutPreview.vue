<script setup lang="ts">
import type { CatalogLayout } from '../../types'
import { computed, onErrorCaptured, ref, shallowRef, watchEffect } from 'vue'
import { slideHeight, slideWidth } from '@slidev/client/env.ts'

/**
 * A thumbnail of what a layout does with a slide.
 *
 * The slide's own body cannot be re-rendered under a different layout, since
 * Slidev bakes the layout into each slide at compile time. So the preview
 * renders the layout at real slide size with the current slide's frontmatter
 * and stand-in content, then scales it down. That shows the composition a
 * layout gives you, which is the thing being chosen, and layouts driven purely
 * by frontmatter, such as `fact`, show their actual values.
 *
 * The error boundary lives here rather than in a wrapper because the layout
 * vnode has to be created by the component that catches for it.
 */
const props = defineProps<{ layout: CatalogLayout, frontmatter: Record<string, any> }>()

/** Thumbnails are a fixed width, so the scale is a constant rather than a measurement. */
const THUMBNAIL_WIDTH = 140

const loaded = shallowRef<any>(null)
const failed = ref(false)

const scale = computed(() => THUMBNAIL_WIDTH / slideWidth.value)
const boxStyle = computed(() => ({ height: `${scale.value * slideHeight.value}px` }))
const stageStyle = computed(() => ({
  width: `${slideWidth.value}px`,
  height: `${slideHeight.value}px`,
  transform: `scale(${scale.value})`,
}))

watchEffect(async () => {
  if (!props.layout.load)
    return
  try {
    loaded.value = (await props.layout.load()).default
  }
  catch {
    failed.value = true
  }
})

onErrorCaptured(() => {
  failed.value = true
  return false
})
</script>

<template>
  <div class="studio-layout-preview" :style="boxStyle">
    <div v-if="loaded && !failed" class="studio-layout-preview__stage" :style="stageStyle">
      <component :is="loaded" v-bind="frontmatter">
        <h1>Slide title</h1>
        <p>Body text sits here, so the shape of the layout is visible.</p>
      </component>
    </div>
    <span v-else class="studio-card__placeholder">{{ layout.name }}</span>
  </div>
</template>
