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
  /**
   * An element's own box in canvas units.
   *
   * Deliberately not the bounding rect's width and height: for a rotated
   * element that is the axis-aligned box *containing* the rotation, which is
   * larger than the element. Measuring it and writing it back as the size grew
   * the element on every gesture. The layout size does not rotate, so it is
   * taken from there and the rect is used only to locate the centre.
   */
  function boxOf(target: Element) {
    const box = target.getBoundingClientRect()
    const layout = target as HTMLElement
    const w = layout.offsetWidth || box.width / scale.value
    const h = layout.offsetHeight || box.height / scale.value
    return {
      x: (box.left + box.width / 2 - rect.value.left) / scale.value - w / 2,
      y: (box.top + box.height / 2 - rect.value.top) / scale.value - h / 2,
      w,
      h,
    }
  }

  return { el, rect, scale, slideWidth, slideHeight, toCanvas, toScreen, boxOf }
}
