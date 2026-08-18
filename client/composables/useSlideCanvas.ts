import { useRafFn } from '@vueuse/core'
import { slideHeight, slideWidth } from '@slidev/client/env.ts'
import { computed, ref, shallowRef, watch } from 'vue'
import { canvasElement } from '../dom'
import { studioOpen } from '../state'

export interface CanvasRect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Bridges the two coordinate systems Studio works in: the browser's pixels and
 * the slide's own canvas units (`canvasWidth` × its aspect ratio), which is
 * what `v-drag` positions are written in.
 *
 * The slide is scaled with a CSS transform to fit the window and may carry a
 * per-slide `zoom`, so the factor between them changes with the window. It is
 * sampled per frame while Studio is open. That is one `getBoundingClientRect` on
 * one element, which is cheaper and far more reliable than trying to observe
 * every input that could move the canvas.
 */
export function useSlideCanvas(zoom: () => number = () => 1) {
  const el = shallowRef<HTMLElement | null>(null)
  const rect = ref<CanvasRect>({ left: 0, top: 0, width: 0, height: 0 })

  const scale = computed(() => (rect.value.width || slideWidth.value) / slideWidth.value * zoom())

  const { pause, resume } = useRafFn(() => {
    const found = canvasElement()
    if (found !== el.value)
      el.value = found
    if (!found)
      return
    const box = found.getBoundingClientRect()
    const current = rect.value
    if (current.left !== box.left || current.top !== box.top || current.width !== box.width || current.height !== box.height)
      rect.value = { left: box.left, top: box.top, width: box.width, height: box.height }
  }, { immediate: false })

  watch(studioOpen, (open) => (open ? resume() : pause()), { immediate: true })

  /** Screen point to canvas units. */
  function toCanvas(clientX: number, clientY: number) {
    return {
      x: (clientX - rect.value.left) / scale.value,
      y: (clientY - rect.value.top) / scale.value,
    }
  }

  /** Canvas rectangle to a screen-space style object. */
  function toScreen(box: { x: number, y: number, w: number, h: number }) {
    return {
      left: `${rect.value.left + box.x * scale.value}px`,
      top: `${rect.value.top + box.y * scale.value}px`,
      width: `${box.w * scale.value}px`,
      height: `${box.h * scale.value}px`,
    }
  }

  /** A rendered element's box, in canvas units. */
  function boxOf(target: Element) {
    const box = target.getBoundingClientRect()
    return {
      x: (box.left - rect.value.left) / scale.value,
      y: (box.top - rect.value.top) / scale.value,
      w: box.width / scale.value,
      h: box.height / scale.value,
    }
  }

  return { el, rect, scale, slideWidth, slideHeight, toCanvas, toScreen, boxOf }
}
