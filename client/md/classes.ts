import type { SourceRange } from '../types'
import { getBlock, replaceBlock } from './lines'
import { findAttr, firstTag, writeAttr } from './tags'

/**
 * Utility classes on a block.
 *
 * An element or component simply takes a `class` attribute. A Markdown block
 * has nowhere to put one, so Studio uses MDC's trailing `{.class}` syntax,
 * which only works when the deck opts into `mdc: true`, hence `canStyle`.
 */

const RE_MDC_ATTRS = /\{([^{}]*)\}\s*$/

export function canStyle(content: string, range: SourceRange, mdcEnabled: boolean): boolean {
  return !!firstTag(getBlock(content, range))?.start === true || mdcEnabled
}

export function readClasses(content: string, range: SourceRange): string {
  const block = getBlock(content, range)

  if (firstTag(block)?.start === 0)
    return findAttr(block, 'class')?.value ?? ''

  const attrs = block.match(RE_MDC_ATTRS)?.[1] ?? ''
  return attrs
    .split(/\s+/)
    .filter(part => part.startsWith('.'))
    .map(part => part.slice(1))
    .join(' ')
}

export function writeClasses(content: string, range: SourceRange, classes: string): string {
  const block = getBlock(content, range)
  const list = classes.trim().split(/\s+/).filter(Boolean)

  if (firstTag(block)?.start === 0)
    return replaceBlock(content, range, writeAttr(block, 'class', list.length ? list.join(' ') : null))

  const lines = block.split('\n')
  const last = lines.length - 1
  const existing = lines[last].match(RE_MDC_ATTRS)

  // Keep any non-class MDC attributes the author wrote, e.g. `{#id}`.
  const others = (existing?.[1] ?? '')
    .split(/\s+/)
    .filter(part => part && !part.startsWith('.'))

  const body = existing ? lines[last].slice(0, existing.index).replace(/\s+$/, '') : lines[last]
  const attrs = [...list.map(c => `.${c}`), ...others]

  lines[last] = attrs.length ? `${body} {${attrs.join(' ')}}` : body
  return replaceBlock(content, range, lines.join('\n'))
}
