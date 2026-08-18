<script setup lang="ts">
import type { CatalogComponent } from '../../types'
import { computed, defineComponent, shallowRef, watchEffect } from 'vue'
import StudioBoundary from './StudioBoundary.vue'

/**
 * Renders the real component, not a screenshot, by compiling its preview
 * snippet at runtime. Slidev aliases Vue to the full build, so the template
 * compiler is already there.
 */
const props = defineProps<{ component: CatalogComponent }>()

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
  if (!loaded.value)
    return null
  try {
    return defineComponent({
      components: { [props.component.name]: loaded.value },
      template: `<div>${props.component.preview}</div>`,
    })
  }
  catch {
    return null
  }
})
</script>

<template>
  <div class="studio-card__preview">
    <div v-if="preview" class="studio-card__preview-inner">
      <StudioBoundary>
        <component :is="preview" />
        <template #fallback>
          <span class="studio-card__placeholder">&lt;{{ component.name }}&gt;</span>
        </template>
      </StudioBoundary>
    </div>
    <span v-else class="studio-card__placeholder">&lt;{{ component.name }}&gt;</span>
  </div>
</template>
