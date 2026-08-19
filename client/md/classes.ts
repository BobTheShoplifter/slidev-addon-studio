import type { SourceRange } from '../types'
import { getBlock, replaceBlock } from './lines'
import { findAttr, opensWithTag, writeAttr } from './tags'

/**
 * Utility classes on a block.
 *
 * An element or component simply takes a `class` attribute. A Markdown block
 * has nowhere to put one, so Studio uses MDC's trailing `{.class}` syntax,
 * which only works when the deck opts into `mdc: true`, hence `canStyle`.
 */

const RE_MDC_ATTRS = /\{([^{}]*)\}\s*$/

/**
 * Whether a trailing `{.class}` would land on the block itself.
 *
 * MDC attaches the attributes to the last element on that line, which for a
 * one-line paragraph or heading is the block. On a list it lands on the final
 * `<li>`, on a quote on the paragraph inside it, and on a paragraph written
 * across several lines on a `<span>` around the last few words. Writing one
 * there styles something the author did not select, so it is refused instead.
 */
function mdcTargetsBlock(block: string): boolean {
  const trimmed = block.trim()
  if (!trimmed || trimmed.includes('\n'))
    return false
  if (/^(?:[-*+]|\d+[.)])\s/.test(trimmed))
    return false
  if (trimmed.startsWith('>') || trimmed.startsWith('|'))
    return false
  return !/^(?:`{3,}|~{3,})/.test(trimmed)
}

export function canStyle(content: string, range: SourceRange, mdcEnabled: boolean): boolean {
  const block = getBlock(content, range)
  return !!opensWithTag(block) || (mdcEnabled && mdcTargetsBlock(block))
}

export function readClasses(content: string, range: SourceRange): string {
  const block = getBlock(content, range)

  if (opensWithTag(block))
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

  if (opensWithTag(block))
    return replaceBlock(content, range, writeAttr(block, 'class', list.length ? list.join(' ') : null))

  // Refuse rather than write a class onto a different element than the one
  // selected. `canStyle` keeps the field out of the panel for these.
  if (!mdcTargetsBlock(block))
    return content

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
