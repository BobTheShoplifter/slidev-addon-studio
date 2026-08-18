export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface Guide {
  orientation: 'vertical' | 'horizontal'
  /** Position along the guide's axis, in canvas units. */
  at: number
  /** Extent of the guide so it can be drawn only where it is relevant. */
  from: number
  to: number
}

export interface SnapResult {
  box: Box
  guides: Guide[]
}

export interface SnapOptions {
  /** Canvas size, for edge and centre guides. */
  canvas: { w: number, h: number }
  /** Other elements to align against, in canvas units. */
  others: Box[]
  /** How close, in canvas units, counts as a hit. */
  threshold: number
  /** Optional grid to fall back on when nothing else is in range. */
  grid?: number
  /** Which edges may move; a move gesture allows all, a resize only some. */
  edges?: { left?: boolean, right?: boolean, top?: boolean, bottom?: boolean }
}

/**
 * Alignment while dragging.
 *
 * Candidates are collected per axis: canvas edges, canvas centre, thirds, and
 * every edge and centre of the other elements on the slide. The moving
 * box latches onto the nearest one within the threshold. Guides are returned
 * alongside the corrected box so the overlay can show exactly what it caught.
 */
export function snapBox(box: Box, options: SnapOptions): SnapResult {
  const { canvas, others, threshold } = options
  const edges = options.edges ?? { left: true, right: true, top: true, bottom: true }
  const guides: Guide[] = []

  const verticalCandidates = [
    0,
    canvas.w / 3,
    canvas.w / 2,
    (canvas.w / 3) * 2,
    canvas.w,
    ...others.flatMap(other => [other.x, other.x + other.w / 2, other.x + other.w]),
  ]
  const horizontalCandidates = [
    0,
    canvas.h / 3,
    canvas.h / 2,
    (canvas.h / 3) * 2,
    canvas.h,
    ...others.flatMap(other => [other.y, other.y + other.h / 2, other.y + other.h]),
  ]

  const result: Box = { ...box }

  const movingX: { value: number, apply: (delta: number) => void }[] = []
  if (edges.left && edges.right) {
    movingX.push(
      { value: box.x, apply: d => (result.x += d) },
      { value: box.x + box.w / 2, apply: d => (result.x += d) },
      { value: box.x + box.w, apply: d => (result.x += d) },
    )
  }
  else {
    if (edges.left)
      movingX.push({ value: box.x, apply: (d) => { result.x += d; result.w -= d } })
    if (edges.right)
      movingX.push({ value: box.x + box.w, apply: d => (result.w += d) })
  }

  const movingY: { value: number, apply: (delta: number) => void }[] = []
  if (edges.top && edges.bottom) {
    movingY.push(
      { value: box.y, apply: d => (result.y += d) },
      { value: box.y + box.h / 2, apply: d => (result.y += d) },
      { value: box.y + box.h, apply: d => (result.y += d) },
    )
  }
  else {
    if (edges.top)
      movingY.push({ value: box.y, apply: (d) => { result.y += d; result.h -= d } })
    if (edges.bottom)
      movingY.push({ value: box.y + box.h, apply: d => (result.h += d) })
  }

  const bestX = closest(movingX, verticalCandidates, threshold)
  if (bestX) {
    bestX.edge.apply(bestX.delta)
    guides.push({ orientation: 'vertical', at: bestX.candidate, from: 0, to: canvas.h })
  }
  else if (options.grid) {
    result.x = Math.round(result.x / options.grid) * options.grid
  }

  const bestY = closest(movingY, horizontalCandidates, threshold)
  if (bestY) {
    bestY.edge.apply(bestY.delta)
    guides.push({ orientation: 'horizontal', at: bestY.candidate, from: 0, to: canvas.w })
  }
  else if (options.grid) {
    result.y = Math.round(result.y / options.grid) * options.grid
  }

  result.w = Math.max(8, result.w)
  result.h = Math.max(8, result.h)

  return { box: result, guides }
}

function closest(
  edges: { value: number, apply: (delta: number) => void }[],
  candidates: number[],
  threshold: number,
) {
  let best: { edge: typeof edges[number], candidate: number, delta: number, distance: number } | null = null
  for (const edge of edges) {
    for (const candidate of candidates) {
      const distance = Math.abs(candidate - edge.value)
      if (distance > threshold)
        continue
      if (!best || distance < best.distance)
        best = { edge, candidate, delta: candidate - edge.value, distance }
    }
  }
  return best
}
