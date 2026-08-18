<script setup lang="ts">
import { computed, ref } from 'vue'
import { onDomEvent } from '../composables/useDomEvent'
import { activePanel, dockWidth, studioOpen } from '../state'
import PanelAnimate from './panels/PanelAnimate.vue'
import PanelAssets from './panels/PanelAssets.vue'
import PanelComponents from './panels/PanelComponents.vue'
import PanelInspect from './panels/PanelInspect.vue'
import PanelLayout from './panels/PanelLayout.vue'
import PanelSlides from './panels/PanelSlides.vue'
import StudioIcon from './parts/StudioIcon.vue'

const panels = {
  inspect: { title: 'Element', component: PanelInspect },
  components: { title: 'Components', component: PanelComponents },
  animate: { title: 'Animation', component: PanelAnimate },
  layout: { title: 'Slide layout', component: PanelLayout },
  slides: { title: 'Slides', component: PanelSlides },
  assets: { title: 'Assets', component: PanelAssets },
} as const

const current = computed(() => panels[activePanel.value] ?? panels.inspect)

const resizing = ref(false)

onDomEvent<PointerEvent>(window, 'pointermove', (event) => {
  if (!resizing.value)
    return
  dockWidth.value = Math.min(560, Math.max(240, window.innerWidth - event.clientX))
})

onDomEvent(window, 'pointerup', () => (resizing.value = false))
</script>

<template>
  <aside class="studio-dock" :style="{ width: `${dockWidth}px` }">
    <div
      class="studio-dock__resizer"
      title="Drag to resize"
      @pointerdown.prevent="resizing = true"
    />
    <header class="studio-dock__header">
      <span class="studio-dock__title">{{ current.title }}</span>
      <button class="studio-icon-button" title="Close Studio (E)" @click="studioOpen = false">
        <StudioIcon name="close" />
      </button>
    </header>
    <div class="studio-dock__body">
      <component :is="current.component" />
    </div>
  </aside>
</template>
