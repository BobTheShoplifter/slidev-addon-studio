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

interface Rect { left: number, top: number, width: number, height: number, rotate: number }

/**
 * How far the element is turned, read from whatever put it there: Slidev's
 * `v-drag`, the theme, or the author's own CSS.
 */
function rotationOf(el: Element): number {
  const transform = getComputedStyle(el).transform
  if (!transform || transform === 'none')
    return 0
  const matrix = new DOMMatrixReadOnly(transform)
  return Math.round(Math.atan2(matrix.b, matrix.a) * 180 / Math.PI)
}

/**
 * The element the rotation is actually on.
 *
 * A block wrapped in `<v-drag>` is not turned itself: Slidev turns the
 * container it puts around it, so reading only the block's own transform found
 * nothing and the frame fell back to the upright box containing the rotation.
 * A scale, which is what the deck and the dock apply further up, is not a
 * rotation and reads as zero degrees.
 */
function turnedElement(el: HTMLElement): { el: HTMLElement, rotate: number } {
  let node: HTMLElement | null = el
  for (let depth = 0; node && depth < 3; depth++) {
    const rotate = rotationOf(node)
    if (rotate)
      return { el: node, rotate }
    node = node.parentElement
  }
  return { el, rotate: 0 }
}

const selectionRect = ref<Rect | null>(null)
const hoverRect = ref<Rect | null>(null)
const outlineRects = ref<Rect[]>([])

/**
 * The element's own box on screen, and its rotation.
 *
 * Not `getBoundingClientRect` alone: for a rotated element that is the upright
 * box *containing* it, so the outline and the handles were drawn around empty
 * corners rather than around the element. The canvas measures the untilted box,
 * and the frame is then turned to match.
 */
function rectOf(el: Element | null | undefined): Rect | null {
  if (!el?.isConnected)
    return null
  const bounds = el.getBoundingClientRect()
  if (!bounds.width && !bounds.height)
    return null

  const turned = turnedElement(el as HTMLElement)
  if (!turned.rotate)
    return { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, rotate: 0 }

  const { rect, scale } = studio.canvas
  const box = studio.canvas.boxOf(turned.el)
  return {
    left: rect.value.left + box.x * scale.value,
    top: rect.value.top + box.y * scale.value,
    width: box.w * scale.value,
    height: box.h * scale.value,
    rotate: turned.rotate,
  }
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

function frameStyle(rect: Rect) {
  return {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    transform: rect.rotate ? `rotate(${rect.rotate}deg)` : undefined,
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
      <!-- The label stays upright, so it is readable however the block is turned. -->
      <div
        class="studio-badge"
        :style="{ left: `${selectionRect.left}px`, top: `${selectionRect.top - 4}px` }"
      >
        {{ selection.label }}{{ selection.positioned ? ' · free' : '' }}
      </div>

      <!--
        One frame for the outline, the move surface and the handles, so a
        rotated block gets a frame that is turned with it rather than the
        upright box that happens to contain it.
      -->
      <div class="studio-frame" :style="frameStyle(selectionRect)">
        <div class="studio-outline studio-outline--frame" />

        <!--
          The body of the selection is the move handle. It is named so a double
          click landing on it can be understood as a double click on the block
          it covers, which is what the user aimed at.
        -->
        <div
          class="studio-move"
          @pointerdown="studio.gizmo.startMove($event)"
        />

        <div
          v-for="handle in handles"
          :key="handle.id"
          class="studio-handle"
          :style="{ left: `${handle.x * 100}%`, top: `${handle.y * 100}%`, cursor: handle.cursor }"
          @pointerdown="studio.gizmo.startResize($event, handle.id)"
        />

        <div
          class="studio-handle studio-handle--rotate"
          style="left: 50%; top: -22px"
          title="Rotate. Hold Shift for 15° steps"
          @pointerdown="studio.gizmo.startRotate($event)"
        />
      </div>
    </template>

    <div
      v-for="(guide, index) in guideStyles"
      :key="`guide-${index}`"
      class="studio-guide"
      :style="guide"
    />
  </div>
</template>
