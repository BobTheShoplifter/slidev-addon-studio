import type { StudioContext } from './context'
import type { SourceRange, StudioTarget } from './types'
import { readDrag, removeDrag, writeDrag } from './md/drag'
import { getBlock, insertAfter, moveBlock, removeBlock } from './md/lines'
import { editing, selection } from './state'

/**
 * What can be done to the selected block, in one place.
 *
 * The Element panel and the right-click menu offer the same handful of actions,
 * and an action that behaves differently depending on where it was invoked from
 * is a bug waiting to happen, so both call these.
 */

/**
 * The lines an arrange action owns.
 *
 * A block given a free position lives inside a `<v-drag>` wrapper, and the
 * wrapper is part of the thing on screen: reordering only the block moved it
 * out and left an empty wrapper behind, holding a position and nothing to
 * position. Moving, duplicating or deleting takes the whole wrapper.
 */
export function positionedUnit(content: string, range: SourceRange): SourceRange {
  const wrapper = readDrag(content, range)
  return wrapper?.via === 'wrapper' && wrapper.open !== undefined && wrapper.close !== undefined
    ? [wrapper.open, wrapper.close + 1]
    : range
}

/** Whether the block already carries a position of its own. */
export function isPositioned(content: string, range: SourceRange): boolean {
  return !!readDrag(content, range)?.pos
}

export function editText() {
  if (selection.value?.range)
    editing.value = true
}

/**
 * Lifts the block out of the document flow, where it is standing.
 *
 * Measured from what is on screen rather than from a guess, so the block does
 * not jump the moment it becomes free.
 */
export async function freePosition(studio: StudioContext, target: StudioTarget) {
  if (!target.range)
    return
  const box = studio.canvas.boxOf(target.el)
  await studio.commit(
    writeDrag(studio.content(), target.range, { x: box.x, y: box.y, w: box.w, h: null, rotate: 0 }),
    'Free position',
  )
}

export async function returnToFlow(studio: StudioContext, target: StudioTarget) {
  if (!target.range)
    return
  await studio.commit(removeDrag(studio.content(), target.range), 'Return to flow')
}

export async function duplicateBlock(studio: StudioContext, target: StudioTarget) {
  if (!target.range)
    return
  const unit = positionedUnit(studio.content(), target.range)
  await studio.commit(
    insertAfter(studio.content(), unit, getBlock(studio.content(), unit)),
    'Duplicate block',
  )
}

export async function deleteBlock(studio: StudioContext, target: StudioTarget) {
  if (!target.range)
    return
  const unit = positionedUnit(studio.content(), target.range)
  selection.value = null
  await studio.commit(removeBlock(studio.content(), unit), `Delete ${target.label}`)
}

export async function moveBlockBy(studio: StudioContext, target: StudioTarget, direction: -1 | 1) {
  if (!target.range)
    return
  const unit = positionedUnit(studio.content(), target.range)
  await studio.commit(moveBlock(studio.content(), unit, direction), 'Reorder block')
}
