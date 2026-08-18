<script setup lang="ts">
import type { ResizeHandle } from '../composables/useTransformGizmo'
import { useRafFn } from '@vueuse/core'
import { computed, ref } from 'vue'
import { mappedElements } from '../dom'
import { useStudio } from '../context'
import { editing, hovered, outlineEnabled, selection } from '../state'

/**
 * Everything drawn on top of the slide: the hover outline, the selection box
 * with its handles, and the alignment guides a drag snapped to.
 *
 * The layer itself ignores the pointer, only the handles take it, so a click
 * anywhere else still reaches the slide and selects what is under it.
 */
const studio = useStudio()

interface Rect { left: number, top: number, width: number, height: number }

const selectionRect = ref<Rect | null>(null)
const hoverRect = ref<Rect | null>(null)
const outlineRects = ref<Rect[]>([])

function rectOf(el: Element | null | undefined): Rect | null {
  if (!el?.isConnected)
    return null
  const box = el.getBoundingClientRect()
  if (!box.width && !box.height)
    return null
  return { left: box.left, top: box.top, width: box.width, height: box.height }
}

useRafFn(() => {
  selectionRect.value = rectOf(selection.value?.el)
  hoverRect.value = hovered.value?.el === selection.value?.el ? null : rectOf(hovered.value?.el)
  outlineRects.value = outlineEnabled.value
    ? mappedElements(studio.no()).map(rectOf).filter((r): r is Rect => !!r)
    : []
})

const handles: { id: ResizeHandle, x: number, y: number, cursor: string }[] = [
  { id: 'nw', x: 0, y: 0, cursor: 'nwse-resize' },
  { id: 'n', x: 0.5, y: 0, cursor: 'ns-resize' },
  { id: 'ne', x: 1, y: 0, cursor: 'nesw-resize' },
  { id: 'e', x: 1, y: 0.5, cursor: 'ew-resize' },
  { id: 'se', x: 1, y: 1, cursor: 'nwse-resize' },
  { id: 's', x: 0.5, y: 1, cursor: 'ns-resize' },
  { id: 'sw', x: 0, y: 1, cursor: 'nesw-resize' },
  { id: 'w', x: 0, y: 0.5, cursor: 'ew-resize' },
]

const guideStyles = computed(() => studio.gizmo.guides.value.map((guide) => {
  const { rect, scale } = studio.canvas
  return guide.orientation === 'vertical'
    ? {
        left: `${rect.value.left + guide.at * scale.value}px`,
        top: `${rect.value.top}px`,
        width: '1px',
        height: `${rect.value.height}px`,
      }
    : {
        left: `${rect.value.left}px`,
        top: `${rect.value.top + guide.at * scale.value}px`,
        width: `${rect.value.width}px`,
        height: '1px',
      }
}))

function style(rect: Rect) {
  return {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  }
}

function handleStyle(rect: Rect, handle: typeof handles[number]) {
  return {
    left: `${rect.left + rect.width * handle.x}px`,
    top: `${rect.top + rect.height * handle.y}px`,
    cursor: handle.cursor,
  }
}
</script>

<template>
  <div class="studio-layer">
    <div
      v-for="(rect, index) in outlineRects"
      :key="`outline-${index}`"
      class="studio-outline studio-outline--hover"
      :style="{ ...style(rect), opacity: 0.35 }"
    />

    <div v-if="hoverRect" class="studio-outline studio-outline--hover" :style="style(hoverRect)" />

    <template v-if="selectionRect && selection && !editing">
      <div class="studio-outline" :style="style(selectionRect)" />

      <div
        class="studio-badge"
        :style="{ left: `${selectionRect.left}px`, top: `${selectionRect.top - 4}px` }"
      >
        {{ selection.label }}{{ selection.positioned ? ' · free' : '' }}
      </div>

      <!-- The body of the selection is the move handle. -->
      <div
        :style="{ ...style(selectionRect), position: 'fixed', cursor: 'move', pointerEvents: 'auto' }"
        @pointerdown="studio.gizmo.startMove($event)"
      />

      <div
        v-for="handle in handles"
        :key="handle.id"
        class="studio-handle"
        :style="handleStyle(selectionRect, handle)"
        @pointerdown="studio.gizmo.startResize($event, handle.id)"
      />

      <div
        class="studio-handle studio-handle--rotate"
        :style="{ left: `${selectionRect.left + selectionRect.width / 2}px`, top: `${selectionRect.top - 22}px` }"
        title="Rotate. Hold Shift for 15° steps"
        @pointerdown="studio.gizmo.startRotate($event)"
      />
    </template>

    <div
      v-for="(guide, index) in guideStyles"
      :key="`guide-${index}`"
      class="studio-guide"
      :style="guide"
    />
  </div>
</template>
