import type { StudioContext } from './context'
import type { SourceRange, StudioTarget } from './types'
import { readDrag, removeDrag, writeDrag } from './md/drag'
import { duplicateListItem, getBlock, insertAfter, moveBlock, moveListItem, removeBlock } from './md/lines'
import { editing, reportError, selection } from './state'

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

  /*
   * A block that shares its Markdown block with siblings cannot be lifted out
   * of it.
   *
   * The position is written by wrapping the block's lines in `<v-drag>`, and
   * for one item of a list those lines sit in the middle of the list. Wrapping
   * them splices an HTML block into it, which ends the list above and starts a
   * new one below: the item is orphaned and its neighbours quietly change which
   * list, and which level, they belong to. Refusing is the only honest answer
   * until the item can be promoted out of its list first.
   */
  if (target.nested) {
    reportError(new Error(
      `A ${target.label} inside a list cannot be given its own position: it would split the list around it. `
      + 'Move the whole list instead, or take the item out of the list first.',
    ))
    return
  }
  const box = studio.canvas.boxOf(target.el)
  // Written in the coordinates Slidev will read it in, which are the block's
  // own containing block rather than the slide when a layout positions its
  // panes. Without this the block jumps by the pane's offset the moment it is
  // given a position.
  const origin = studio.canvas.originOf(target.el)
  await studio.commit(
    writeDrag(studio.content(), target.range, { x: box.x - origin.x, y: box.y - origin.y, w: box.w, h: null, rotate: 0 }),
    'Free position',
  )
}

export async function returnToFlow(studio: StudioContext, target: StudioTarget) {
  if (!target.range)
    return
  await studio.commit(removeDrag(studio.content(), target.range), 'Return to flow')
}

/**
 * Whether reordering and duplicating apply.
 *
 * A block that shares its Markdown with siblings usually cannot be moved on its
 * own. A list item is the exception: it has its own line, and its siblings are
 * the other lines of the same list, so the two operations mean something
 * precise there. They are written by the list aware functions rather than the
 * block ones, which is what stopped an item jumping over its siblings or
 * breaking the list in two around a copy.
 */
export function canReorder(target: StudioTarget): boolean {
  return !target.nested || target.kind === 'list-item'
}

export async function duplicateBlock(studio: StudioContext, target: StudioTarget) {
  if (!target.range)
    return

  if (target.kind === 'list-item') {
    const next = duplicateListItem(studio.content(), target.range[0])
    if (next)
      await studio.commit(next, 'Duplicate list item')
    return
  }
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

  if (target.kind === 'list-item') {
    const next = moveListItem(studio.content(), target.range[0], direction)
    // Null means there is no sibling that way, so there is nothing to do.
    if (next)
      await studio.commit(next, 'Reorder list item')
    return
  }
  const unit = positionedUnit(studio.content(), target.range)
  await studio.commit(moveBlock(studio.content(), unit, direction), 'Reorder block')
}
