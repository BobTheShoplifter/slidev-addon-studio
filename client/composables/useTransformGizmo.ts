import type { DragPos, StudioTarget } from '../types'
import type { Box, Guide } from './useSnapping'
import type { useSlideCanvas } from './useSlideCanvas'
import { ref, shallowRef } from 'vue'
import { mappedElements } from '../dom'
import { onDomEvent } from './useDomEvent'
import { readDrag, writeDrag } from '../md/drag'
import { gridEnabled, gridSize, snapEnabled } from '../state'
import { snapBox } from './useSnapping'

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/**
 * How far the pointer must travel, in screen pixels, before a press counts as a
 * gesture. Below this nothing is painted and nothing is written: a click is a
 * click, and giving a block a fixed position is a decision, not a twitch.
 */
const DRAG_THRESHOLD = 4

/** How much of an element must stay on the canvas, in canvas units. */
const MIN_ON_CANVAS = 24

type Gesture =
  | { type: 'move' }
  | { type: 'resize', handle: ResizeHandle }
  | { type: 'rotate' }

/**
 * Move, resize and rotate on the canvas.
 *
 * The gesture paints straight onto the element's inline style so it tracks the
 * pointer at screen refresh rate, and only writes Markdown once, on release.
 * Dragging a block that has no position yet gives it one, which is what turns
 * a document into a canvas, and the inspector can always send it back into
 * the flow.
 */
export function useTransformGizmo(context: {
  canvas: ReturnType<typeof useSlideCanvas>
  getTarget: () => StudioTarget | null
  getContent: () => string
  /** The slide being edited, so a gesture cannot land on a different one. */
  getNo: () => number
  commit: (content: string, label: string, options?: { skipHmr?: boolean, keepSelection?: boolean }) => Promise<void>
}) {
  const { canvas } = context

  /** A gesture is armed on pointerdown but only becomes active once it moves. */
  const armed = ref(false)
  const active = ref(false)
  const guides = shallowRef<Guide[]>([])
  const preview = shallowRef<Box | null>(null)

  let gesture: Gesture | null = null
  let target: StudioTarget | null = null
  let startBox: Box = { x: 0, y: 0, w: 0, h: 0 }
  let hadPosition = false
  let startRotate = 0
  let autoHeight = true
  let pointerStart = { x: 0, y: 0 }
  let others: Box[] = []
  let painted: HTMLElement | null = null
  let restore = ''
  let startNo = 0

  function start(event: PointerEvent, next: Gesture) {
    const current = context.getTarget()
    if (!current || !current.range)
      return

    event.preventDefault()
    event.stopPropagation()

    target = current
    gesture = next
    armed.value = true

    const existing = readDrag(context.getContent(), current.range)
    hadPosition = !!existing
    startBox = canvas.boxOf(current.el)
    startRotate = existing?.pos?.rotate ?? 0
    autoHeight = existing?.pos ? existing.pos.h === null : true
    pointerStart = { x: event.clientX, y: event.clientY }
    preview.value = { ...startBox }

    startNo = current.no
    others = collectOthers(current.el, current.no)
    painted = current.el
    restore = painted.getAttribute('style') ?? ''
  }

  /**
   * Detaching the element from the flow is deferred until the gesture is real.
   * Doing it on pointerdown made a plain click visibly shift the slide, because
   * the element left its parent's centring before anyone had asked for it.
   */
  function begin() {
    active.value = true
    if (painted && !hadPosition) {
      painted.style.position = 'absolute'
      painted.style.margin = '0'
    }
  }

  onDomEvent<PointerEvent>(window, 'pointermove', (event) => {
    if (!armed.value || !gesture || !target)
      return

    if (!active.value) {
      const travelled = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y)
      if (travelled < DRAG_THRESHOLD)
        return
      begin()
    }

    const dx = (event.clientX - pointerStart.x) / canvas.scale.value
    const dy = (event.clientY - pointerStart.y) / canvas.scale.value

    if (gesture.type === 'rotate') {
      const centreX = canvas.rect.value.left + (startBox.x + startBox.w / 2) * canvas.scale.value
      const centreY = canvas.rect.value.top + (startBox.y + startBox.h / 2) * canvas.scale.value
      const angle = Math.atan2(event.clientY - centreY, event.clientX - centreX) * 180 / Math.PI + 90
      startRotate = event.shiftKey ? Math.round(angle / 15) * 15 : Math.round(angle)
      paint(preview.value ?? startBox, startRotate)
      return
    }

    let box: Box
    let edges: { left?: boolean, right?: boolean, top?: boolean, bottom?: boolean }

    if (gesture.type === 'move') {
      box = { ...startBox, x: startBox.x + dx, y: startBox.y + dy }
      edges = { left: true, right: true, top: true, bottom: true }
    }
    else {
      box = resize(startBox, gesture.handle, dx, dy, event.shiftKey)
      edges = {
        left: gesture.handle.includes('w'),
        right: gesture.handle.includes('e'),
        top: gesture.handle.includes('n'),
        bottom: gesture.handle.includes('s'),
      }
    }

    if (snapEnabled.value && !event.altKey) {
      const result = snapBox(box, {
        canvas: { w: canvas.slideWidth.value, h: canvas.slideHeight.value },
        others,
        threshold: 6 / canvas.scale.value,
        grid: gridEnabled.value ? gridSize.value : undefined,
        edges,
      })
      box = result.box
      guides.value = result.guides
    }
    else {
      guides.value = []
    }

    preview.value = clampToCanvas(box)
    paint(preview.value, startRotate)
  })

  onDomEvent(window, 'pointerup', async () => {
    if (!armed.value)
      return

    // A press that never moved is a click. Nothing was painted and nothing is
    // written, so selecting an element cannot silently reposition it.
    if (!active.value) {
      armed.value = false
      gesture = null
      preview.value = null
      target = null
      painted = null
      return
    }

    // The deck can move under a gesture: a remote, an autoplay, a stray arrow
    // key. Writing then means writing this slide's line range into whatever
    // slide is now current, so the gesture is abandoned instead.
    if (!target?.range || context.getNo() !== startNo) {
      if (painted && !hadPosition)
        painted.setAttribute('style', restore)
      armed.value = false
      active.value = false
      guides.value = []
      gesture = null
      preview.value = null
      target = null
      painted = null
      return
    }

    const box = preview.value ?? startBox
    const wasResize = gesture?.type === 'resize'
    // Only an edge that moved vertically fixes the height. A purely horizontal
    // resize used to freeze it too, writing a number the element was never
    // painted at.
    const changedHeight = gesture?.type === 'resize' && /[ns]/.test(gesture.handle)
    armed.value = false
    active.value = false
    guides.value = []
    gesture = null

    const pos: DragPos = {
      x: box.x,
      y: box.y,
      w: box.w,
      // A resize that touched a vertical edge fixes the height; otherwise the
      // element keeps sizing itself, which is what authors usually want.
      h: autoHeight && !changedHeight ? null : box.h,
      rotate: startRotate,
    }

    const content = context.getContent()
    const next = writeDrag(content, target.range, pos)
    const label = wasResize ? 'Resize element' : 'Move element'

    // An element that already had a position only changes its numbers, and the
    // paint above already shows the result. Rebuilding the slide for that is
    // what made dragging feel heavy and dropped the selection on every move, so
    // the write skips HMR and the painted style stands, exactly as Slidev's own
    // `v-drag` does. A block being positioned for the first time does need the
    // re-render, since only then does the directive take over its layout.
    const inPlace = hadPosition
    if (!inPlace && painted)
      painted.setAttribute('style', restore)
    if (!inPlace)
      painted = null

    await context.commit(next, label, { skipHmr: inPlace, keepSelection: inPlace })
    preview.value = null
    target = null
  })

  /**
   * Escape backs out of a gesture: the element returns to where it was and
   * nothing is written. Every editor offers this, and without it a drag that
   * has gone wrong can only be finished and then undone.
   */
  onDomEvent<KeyboardEvent>(window, 'keydown', (event) => {
    if (event.key !== 'Escape' || !armed.value)
      return

    event.preventDefault()
    if (painted && !hadPosition)
      painted.setAttribute('style', restore)
    else if (painted)
      paint(startBox, startRotate)

    armed.value = false
    active.value = false
    guides.value = []
    gesture = null
    preview.value = null
    target = null
    painted = null
  })

  /**
   * Keeps a sliver of the element on the canvas. An element dropped entirely
   * outside is invisible and, because the slide clips its overflow, impossible
   * to click and drag back: only undo or hand-editing would recover it.
   */
  function clampToCanvas(box: Box): Box {
    const width = canvas.slideWidth.value
    const height = canvas.slideHeight.value
    return {
      ...box,
      x: Math.min(Math.max(box.x, MIN_ON_CANVAS - box.w), width - MIN_ON_CANVAS),
      y: Math.min(Math.max(box.y, MIN_ON_CANVAS - box.h), height - MIN_ON_CANVAS),
    }
  }

  function paint(box: Box, rotate: number) {
    if (!painted)
      return
    painted.style.left = `${box.x}px`
    painted.style.top = `${box.y}px`
    painted.style.width = `${box.w}px`
    if (!autoHeight)
      painted.style.height = `${box.h}px`
    painted.style.transform = rotate ? `rotate(${rotate}deg)` : ''
    painted.style.transformOrigin = 'center center'
  }

  function collectOthers(self: HTMLElement, no: number): Box[] {
    return mappedElements(no)
      .filter(el => el !== self && !el.contains(self) && !self.contains(el))
      .map(el => canvas.boxOf(el))
  }

  return {
    active,
    armed,
    guides,
    preview,
    startMove: (event: PointerEvent) => start(event, { type: 'move' }),
    startResize: (event: PointerEvent, handle: ResizeHandle) => start(event, { type: 'resize', handle }),
    startRotate: (event: PointerEvent) => start(event, { type: 'rotate' }),
  }
}

function resize(box: Box, handle: ResizeHandle, dx: number, dy: number, keepRatio: boolean): Box {
  const next = { ...box }

  if (handle.includes('e'))
    next.w = box.w + dx
  if (handle.includes('w')) {
    next.x = box.x + dx
    next.w = box.w - dx
  }
  if (handle.includes('s'))
    next.h = box.h + dy
  if (handle.includes('n')) {
    next.y = box.y + dy
    next.h = box.h - dy
  }

  if (keepRatio && box.w > 0 && box.h > 0) {
    const ratio = box.w / box.h
    if (handle === 'n' || handle === 's')
      next.w = next.h * ratio
    else
      next.h = next.w / ratio
  }

  next.w = Math.max(16, next.w)
  next.h = Math.max(16, next.h)
  return next
}
