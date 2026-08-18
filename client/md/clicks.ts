import type { SourceRange } from '../types'
import { getBlock, replaceBlock, toLines, unwrap } from './lines'
import { findAttr, firstTag, writeAttr } from './tags'

/**
 * Click animations, read from and written back to Markdown.
 *
 * Slidev expresses them two ways and Studio keeps both, because each is the
 * idiomatic one for a different kind of block:
 *
 * - an element or component takes the directive directly: `<Pill v-click="2">`
 * - a Markdown block gets a `<v-click>` wrapper, which is renderless: it
 *   applies the directive to the block's own element, so the DOM (and with it
 *   the editor's selection) is unchanged.
 */

/** Entrance animations shipped with Slidev, applied as directive modifiers. */
export const CLICK_ANIMATIONS = [
  { id: '', label: 'Default' },
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Fade' },
  { id: 'fade-in', label: 'Fade in only' },
  { id: 'up', label: 'Rise' },
  { id: 'down', label: 'Drop' },
  { id: 'left', label: 'From left' },
  { id: 'right', label: 'From right' },
  { id: 'scale', label: 'Scale' },
] as const

export interface ClickState {
  /** How the block currently gets its behaviour. */
  via: 'none' | 'attr' | 'wrapper'
  /** Raw `at` value: an absolute step (`3`), or relative (`+1`, `-1`). */
  at: string
  /** Hide at the step instead of revealing. */
  hide: boolean
  /** Reveal children one at a time, i.e. a `<v-clicks>` wrapper. */
  stagger: boolean
  animation: string
  /** `<v-clicks>` only: how many children share a step. */
  every: number
  /** `<v-clicks>` only: how deep to descend into nested lists. */
  depth: number
}

export const EMPTY_CLICKS: ClickState = {
  via: 'none',
  at: '+1',
  hide: false,
  stagger: false,
  animation: '',
  every: 1,
  depth: 1,
}

const RE_WRAPPER_OPEN = /^<(v-clicks?)((?:"[^"]*"|'[^']*'|[^>"'])*)>$/
const RE_WRAPPER_CLOSE = /^<\/(v-clicks?)>$/

export interface Wrapper {
  tag: 'v-click' | 'v-clicks'
  open: number
  close: number
  attrs: string
}

/** Finds a `<v-click>`/`<v-clicks>` pair wrapping the given block, if any. */
export function findWrapper(content: string, range: SourceRange): Wrapper | null {
  const lines = toLines(content)

  // A range can outlive the content it came from: a panel may still be showing
  // the previous selection for a frame after an edit shortens the slide.
  let above = Math.min(range[0], lines.length) - 1
  while (above >= 0 && !lines[above]?.trim())
    above -= 1
  const open = above >= 0 ? lines[above].trim().match(RE_WRAPPER_OPEN) : null
  if (!open)
    return null

  let below = range[1]
  while (below < lines.length && !lines[below].trim())
    below += 1
  const close = below < lines.length ? lines[below].trim().match(RE_WRAPPER_CLOSE) : null
  if (!close || close[1] !== open[1])
    return null

  return { tag: open[1] as Wrapper['tag'], open: above, close: below, attrs: open[2] }
}

export function readClicks(content: string, range: SourceRange): ClickState {
  const block = getBlock(content, range)
  const tag = firstTag(block)

  if (tag && tag.start === 0) {
    const click = findAttr(block, 'v-click')
    if (click) {
      return {
        ...EMPTY_CLICKS,
        via: 'attr',
        at: click.value ?? '+1',
        hide: click.modifiers.includes('hide'),
        animation: click.modifiers.find(m => m !== 'hide') ?? '',
      }
    }
  }

  const wrapper = findWrapper(content, range)
  if (wrapper) {
    const attrs = `<${wrapper.tag}${wrapper.attrs}>`
    return {
      ...EMPTY_CLICKS,
      via: 'wrapper',
      stagger: wrapper.tag === 'v-clicks',
      at: findAttr(attrs, 'at')?.value ?? '+1',
      hide: !!findAttr(attrs, 'hide'),
      animation: findAttr(attrs, 'animation')?.value ?? '',
      every: Number(findAttr(attrs, 'every')?.value ?? 1),
      depth: Number(findAttr(attrs, 'depth')?.value ?? 1),
    }
  }

  return { ...EMPTY_CLICKS }
}

export interface WriteClicksOptions {
  /** Prefer the directive form; only possible when the block opens with a tag. */
  preferAttr?: boolean
}

/**
 * Applies a click state to a block, choosing the representation that fits.
 * Passing `via: 'none'` removes the animation entirely.
 */
export function writeClicks(
  content: string,
  range: SourceRange,
  next: ClickState,
  options: WriteClicksOptions = {},
): string {
  const cleared = clearClicksAt(content, range)
  if (next.via === 'none')
    return cleared.content

  const block = getBlock(cleared.content, cleared.range)
  const tag = firstTag(block)
  const canUseAttr = !!tag && tag.start === 0 && !next.stagger && (options.preferAttr ?? true)

  if (canUseAttr) {
    const modifiers = [
      ...(next.hide ? ['hide'] : []),
      ...(next.animation ? [next.animation] : []),
    ]
    const withClick = writeAttr(block, 'v-click', next.at === '+1' ? true : next.at, { modifiers })
    return replaceBlock(cleared.content, cleared.range, withClick)
  }

  const tagName = next.stagger ? 'v-clicks' : 'v-click'
  const attrs = [
    next.at !== '+1' ? ` at="${next.at}"` : '',
    next.hide ? ' hide' : '',
    next.animation ? ` animation="${next.animation}"` : '',
    next.stagger && next.every !== 1 ? ` every="${next.every}"` : '',
    next.stagger && next.depth !== 1 ? ` depth="${next.depth}"` : '',
  ].join('')

  return replaceBlock(cleared.content, cleared.range, `<${tagName}${attrs}>\n\n${block}\n\n</${tagName}>`)
}

/** Removes any click animation from the block, whichever form it used. */
export function clearClicks(content: string, range: SourceRange): string {
  return clearClicksAt(content, range).content
}

/**
 * Strips the animation and reports where the block ended up: removing a
 * wrapper deletes one line above it, so every later edit must use the
 * corrected range.
 */
export function clearClicksAt(content: string, range: SourceRange): { content: string, range: SourceRange } {
  let result = content
  let shift = 0

  const wrapper = findWrapper(result, range)
  if (wrapper) {
    const unwrapped = unwrap(result, wrapper.open, wrapper.close)
    result = unwrapped.content
    shift = unwrapped.removedAbove
  }

  const shifted: SourceRange = [range[0] - shift, range[1] - shift]
  const block = getBlock(result, shifted)
  if (firstTag(block)?.start === 0 && findAttr(block, 'v-click'))
    result = replaceBlock(result, shifted, writeAttr(block, 'v-click', null))

  return { content: result, range: shifted }
}
