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
   * the element on every gesture. The used size does not rotate, so it is taken
   * from there and the rect is used only to locate the centre.
   */
  function boxOf(target: Element) {
    const box = target.getBoundingClientRect()
    const style = getComputedStyle(target)
    const w = usedSize(style, 'width') || box.width / scale.value
    const h = usedSize(style, 'height') || box.height / scale.value
    return {
      x: (box.left + box.width / 2 - rect.value.left) / scale.value - w / 2,
      y: (box.top + box.height / 2 - rect.value.top) / scale.value - h / 2,
      w,
      h,
    }
  }


  /**
   * Where an element's positioning context starts, in slide coordinates.
   *
   * A free position is written as `pos`, and Slidev places that box absolutely.
   * Absolute means "against the nearest positioned ancestor", which is the slide
   * only when nothing in between positions itself. A layout that positions its
   * own panes is such an in-between, so a block inside one, written at the point
   * it was dropped, appeared somewhere else entirely: off by exactly the pane's
   * offset, which is what looked like the block teleporting back.
   *
   * Everything else in the editor works in slide coordinates. This is the one
   * conversion, applied where a box becomes a `pos`.
   */
  function originOf(target: Element) {
    const parent = (target as HTMLElement).offsetParent as HTMLElement | null
    const root = el.value
    if (!parent || !root || parent === root || !root.contains(parent))
      return { x: 0, y: 0 }

    const box = parent.getBoundingClientRect()
    // Absolute positioning is measured from the padding box, inside the border.
    const style = getComputedStyle(parent)
    const left = box.left + (Number.parseFloat(style.borderLeftWidth) || 0)
    const top = box.top + (Number.parseFloat(style.borderTopWidth) || 0)
    return {
      x: (left - rect.value.left) / scale.value,
      y: (top - rect.value.top) / scale.value,
    }
  }

  return { el, rect, scale, slideWidth, slideHeight, toCanvas, toScreen, boxOf, originOf }
}

/**
 * An element's border box along one axis, in layout pixels.
 *
 * `offsetWidth` would do but it is an integer, and a block sized to its own
 * content is a fraction wider than the integer below it. Rounding that away
 * made a heading wrap onto a second line the moment it was given a position.
 */
function usedSize(style: CSSStyleDeclaration, axis: 'width' | 'height'): number {
  const size = Number.parseFloat(style[axis])
  if (!Number.isFinite(size))
    return 0
  // A border-box element already reports the whole box; a content-box one
  // reports only the content, so its padding and border are added back.
  if (style.boxSizing === 'border-box')
    return size

  const sides = axis === 'width' ? ['Left', 'Right'] as const : ['Top', 'Bottom'] as const
  return sides.reduce((total, side) => {
    const padding = Number.parseFloat(style[`padding${side}` as 'paddingLeft']) || 0
    const border = Number.parseFloat(style[`border${side}Width` as 'borderLeftWidth']) || 0
    return total + padding + border
  }, size)
}
