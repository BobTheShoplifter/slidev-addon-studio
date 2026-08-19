<script setup lang="ts">
import type { CatalogComponent } from '../../types'
import { compile, computed, defineComponent, h, shallowRef, watchEffect } from 'vue'
import { useDeckPaint } from '../../composables/useDeckPaint'

/**
 * Renders the real component, not a screenshot, by compiling its example at
 * runtime. Slidev aliases Vue to the full build, so the template compiler is
 * already there.
 *
 * The example often comes from the component's own doc comment, where authors
 * abbreviate: `:items="[{ … }, …]"` documents the shape without being valid
 * JavaScript. Such an example is still the best thing to insert, so it is kept
 * as the snippet and only the preview is skipped. Compiling up front is what
 * makes that distinction possible, and it keeps a malformed example from
 * throwing during render, where a slot cannot be caught by a boundary inside
 * this component.
 */
const props = defineProps<{ component: CatalogComponent }>()

const PLACEHOLDER = defineComponent({
  name: 'StudioPlaceholder',
  render: () => h('span', { class: 'studio-card__placeholder' }, '…'),
})

/**
 * A component is designed against the deck's colours, not the dock's. Rendered
 * on the panel's dark background, anything the theme paints for a light slide
 * disappears, so the preview tile borrows the deck's own paint.
 */
const paint = useDeckPaint()

const loaded = shallowRef<any>(null)

watchEffect(async () => {
  if (!props.component.previewable || !props.component.load)
    return
  try {
    loaded.value = (await props.component.load()).default
  }
  catch {
    loaded.value = null
  }
})

const preview = computed(() => {
  const source = props.component.preview
  if (!loaded.value || !source)
    return null

  try {
    let failed = false
    const render = compile(`<div>${source}</div>`, { onError: () => (failed = true) })
    if (failed)
      return null
    return defineComponent({
      name: `${props.component.name}Preview`,
      // Documentation examples reference stand-ins, such as Transform's
      // `<YourElements />`. Resolving anything unknown to a small placeholder
      // keeps the preview honest and the console quiet.
      components: new Proxy({ [props.component.name]: loaded.value }, {
        get: (target, key: string) => target[key] ?? PLACEHOLDER,
        has: () => true,
      }) as any,
      render,
    })
  }
  catch {
    return null
  }
})
</script>

<template>
  <div class="studio-card__preview" :style="preview ? paint : undefined">
    <div v-if="preview" class="studio-card__preview-inner">
      <component :is="preview" />
    </div>
    <span v-else class="studio-card__placeholder">&lt;{{ component.name }}&gt;</span>
  </div>
</template>
