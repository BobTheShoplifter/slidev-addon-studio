import type { DragPos, SourceRange } from '../types'
import { getBlock, replaceBlock, toLines, unwrap } from './lines'
import { findAttr, firstTag, writeAttr } from './tags'

/**
 * Free positioning, i.e. Slidev's `v-drag`.
 *
 * A block that carries a position is laid out absolutely in slide canvas
 * units, which is what makes PowerPoint-style dragging and resizing possible.
 * Studio writes the same `pos` string Slidev itself writes, so an element
 * moved here and an element moved with Slidev's own handles stay compatible.
 *
 * `pos` is `x,y,w,h[,rotate]` where `x,y` is the top-left corner. A height of
 * `_` (component form) or `NaN` (directive form) means "size to content".
 */

const RE_DRAG_OPEN = /^<v-drag((?:"[^"]*"|'[^']*'|[^>"'])*)>$/
const RE_DRAG_CLOSE = /^<\/v-drag>$/

export function parsePos(raw: string | null | undefined): DragPos | null {
  if (!raw)
    return null
  const parts = raw.replace(/^\[|\]$/g, '').split(',').map(p => p.trim())
  if (parts.length < 3)
    return null
  const [x, y, w, h, rotate] = parts
  const height = h === undefined || h === '_' || h === 'NaN' ? null : Number(h)
  const pos: DragPos = {
    x: Number(x),
    y: Number(y),
    w: Number(w),
    h: height !== null && Number.isFinite(height) ? height : null,
    rotate: rotate ? Number(rotate) : 0,
  }
  return Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.w) ? pos : null
}

export function formatPos(pos: DragPos, style: 'attr' | 'prop'): string {
  const auto = style === 'attr' ? 'NaN' : '_'
  const parts = [Math.round(pos.x), Math.round(pos.y), Math.round(pos.w), pos.h === null ? auto : Math.round(pos.h)]
  if (Math.round(pos.rotate) !== 0)
    parts.push(Math.round(pos.rotate))
  const body = parts.join(',')
  return style === 'attr' ? `[${body}]` : body
}

export interface DragInfo {
  pos: DragPos | null
  via: 'attr' | 'wrapper'
  /** Line of the `<v-drag>` opening tag, for the wrapper form. */
  open?: number
  close?: number
}

export function readDrag(content: string, range: SourceRange): DragInfo | null {
  const block = getBlock(content, range)
  if (firstTag(block)?.start === 0) {
    const attr = findAttr(block, 'v-drag')
    if (attr)
      return { pos: parsePos(attr.value), via: 'attr' }
  }

  const wrapper = findDragWrapper(content, range)
  if (wrapper) {
    const pos = parsePos(findAttr(`<v-drag${wrapper.attrs}>`, 'pos')?.value)
    return { pos, via: 'wrapper', open: wrapper.open, close: wrapper.close }
  }

  return null
}

function findDragWrapper(content: string, range: SourceRange) {
  const lines = toLines(content)

  let above = range[0] - 1
  while (above >= 0 && !lines[above].trim())
    above -= 1
  const open = above >= 0 ? lines[above].trim().match(RE_DRAG_OPEN) : null
  if (!open)
    return null

  let below = range[1]
  while (below < lines.length && !lines[below].trim())
    below += 1
  if (below >= lines.length || !RE_DRAG_CLOSE.test(lines[below].trim()))
    return null

  return { open: above, close: below, attrs: open[1] }
}

/**
 * Gives the block a position, adding the `v-drag` markup if it has none yet.
 * Elements and components take the directive; Markdown blocks get a wrapper.
 */
export function writeDrag(content: string, range: SourceRange, pos: DragPos): string {
  const existing = readDrag(content, range)

  if (existing?.via === 'wrapper' && existing.open !== undefined) {
    const lines = toLines(content)
    lines[existing.open] = writeAttr(lines[existing.open], 'pos', formatPos(pos, 'prop'))
    return lines.join('\n')
  }

  const block = getBlock(content, range)
  if (firstTag(block)?.start === 0)
    return replaceBlock(content, range, writeAttr(block, 'v-drag', formatPos(pos, 'attr')))

  return replaceBlock(content, range, `<v-drag pos="${formatPos(pos, 'prop')}">\n\n${block}\n\n</v-drag>`)
}

/** Returns the block to normal document flow. */
export function removeDrag(content: string, range: SourceRange): string {
  const existing = readDrag(content, range)
  if (!existing)
    return content

  if (existing.via === 'wrapper' && existing.open !== undefined && existing.close !== undefined)
    return unwrap(content, existing.open, existing.close).content

  const block = getBlock(content, range)
  return replaceBlock(content, range, writeAttr(block, 'v-drag', null))
}
