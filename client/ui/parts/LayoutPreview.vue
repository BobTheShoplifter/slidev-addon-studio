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

/**
 * The slide's frontmatter drives the preview, but a layout it does not use will
 * be missing props it requires: `iframe-left` wants a `url` no `layout: demo`
 * slide has. Stand-ins keep the thumbnail honest without filling the console
 * with prop warnings.
 */
const previewProps = computed(() => {
  const declared = new Set((props.layout.props ?? []).map(p => p.name))
  const values: Record<string, any> = { class: props.frontmatter.class }

  // Only what this layout declares. Binding the whole frontmatter put Slidev's
  // own keys on every thumbnail root as stray HTML attributes.
  for (const [key, value] of Object.entries(props.frontmatter)) {
    if (declared.has(key))
      values[key] = value
  }

  for (const prop of props.layout.props ?? []) {
    if (!prop.required || values[prop.name] !== undefined)
      continue
    values[prop.name] = stub(prop.name, prop.type)
  }
  return values
})

function stub(name: string, type: string | undefined) {
  // An empty `url` on an iframe layout resolves to the page's own address, so
  // each such thumbnail would load a whole second copy of the running deck.
  if (/url|src/i.test(name))
    return 'about:blank'

  const kind = (type ?? 'string').toLowerCase()
  if (kind.includes('[]') || kind.startsWith('array'))
    return []
  if (kind.includes('number') && !kind.includes('string'))
    return 0
  if (kind.includes('boolean'))
    return false
  return ''
}

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
      <component :is="loaded" v-bind="previewProps">
        <h1>Slide title</h1>
        <p>Body text sits here, so the shape of the layout is visible.</p>
      </component>
    </div>
    <span v-else class="studio-card__placeholder">{{ layout.name }}</span>
  </div>
</template>
