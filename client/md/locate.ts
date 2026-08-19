import type { SourceRange, TargetKind } from '../types'
import { tagSignature } from '../../shared/signature'
import { toLines } from './lines'

/**
 * Turns the `data-studio-src` hint stamped onto a rendered element into a line
 * range we can safely rewrite.
 *
 * The hint comes from markdown-it, which sees the slide *after* any custom
 * `setup/transformers.ts` has run. Without transformers those coordinates are
 * the source's own; with them they can drift. So the hint is verified against
 * the real Markdown and, when it does not match, the block is found again by
 * its signature. Editing the wrong lines is the one failure mode that would
 * destroy a user's deck, so this always errs towards returning `null`.
 */

export interface Signature {
  kind: TargetKind
  /** Tag name for html/component blocks. */
  tag?: string
  /**
   * Fingerprint of the opening tag as written. Twelve identical `<Mascot />`
   * elements share a name, so the name alone would let a stale hint confirm
   * against the wrong one.
   */
  sig?: string
  /** Normalised leading text for prose blocks. */
  text?: string
  /**
   * The element shares a Markdown block with siblings, so it does not begin a
   * block of its own.
   */
  nested?: boolean
}

const FENCE = /^\s*(`{3,}|~{3,})/

export function resolveRange(content: string, hint: SourceRange | null, signature: Signature): SourceRange | null {
  const lines = toLines(content)

  if (hint && inBounds(hint, lines.length) && matches(lines.slice(hint[0], hint[1]).join('\n'), signature))
    return hint

  // The sweep below can only find a block that starts a line. A nested tag
  // never does, so it would match a *different* element that happens to share
  // this one's signature: the panel would show one element while another was
  // outlined, and Backspace would delete the wrong one.
  if (signature.nested)
    return null

  const candidates: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (startsBlock(lines, i) && matches(blockText(lines, i), signature))
      candidates.push(i)
  }

  // Exactly one, or none. Choosing the nearest of several identical candidates
  // is a guess, and the whole point of this module is that it does not guess.
  if (candidates.length !== 1)
    return null

  const start = candidates[0]
  return [start, blockEnd(lines, start)]
}

function inBounds(range: SourceRange, length: number) {
  return range[0] >= 0 && range[1] > range[0] && range[1] <= length
}

function startsBlock(lines: string[], index: number) {
  if (!lines[index].trim())
    return false
  return index === 0 || !lines[index - 1].trim()
}

/** Extent of the block beginning at `start`: up to the next blank line. */
function blockEnd(lines: string[], start: number) {
  if (FENCE.test(lines[start])) {
    const fence = lines[start].match(FENCE)![1]
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].trimStart().startsWith(fence))
        return i + 1
    }
    return lines.length
  }
  let i = start
  while (i < lines.length && lines[i].trim())
    i += 1
  return i
}

function blockText(lines: string[], start: number) {
  return lines.slice(start, blockEnd(lines, start)).join('\n')
}

function matches(block: string, signature: Signature) {
  if (!block.trim())
    return false

  if (signature.tag) {
    const opening = block.trim().match(/^<[A-Za-z][\w.-]*(?:"[^"]*"|'[^']*'|[^>"'])*/)?.[0]
    if (!opening)
      return false
    const tag = opening.match(/^<([A-Za-z][\w.-]*)/)![1]
    if (tag.toLowerCase() !== signature.tag.toLowerCase())
      return false
    return signature.sig ? tagSignature(opening) === signature.sig : true
  }

  if (signature.kind === 'code')
    return /^\s*(?:`{3,}|~{3,})/.test(block)

  if (signature.kind === 'heading' && !/^#{1,6}\s/.test(block.trim()))
    return false
  if (signature.kind === 'list' && !/^\s*(?:[-*+]|\d+[.)])\s/.test(block.trim()))
    return false
  if (signature.kind === 'quote' && !block.trim().startsWith('>'))
    return false

  if (!signature.text)
    return true

  return sharesText(block, signature.text)
}

/**
 * Compares a Markdown block with the text of the element it rendered to.
 *
 * The two are never identical, because the source carries syntax, inline HTML
 * and component tags that the DOM has already resolved, so this asks a weaker
 * question: do the first few words of the rendered text appear in the source?
 * That is specific enough to tell two blocks apart and loose enough to survive
 * `# Ikke bli <span class="red">hacket.</span>`.
 */
function sharesText(block: string, text: string) {
  const source = new Set(words(stripMarkup(block)))
  const probe = words(text).slice(0, 4)
  if (!probe.length)
    return true
  return probe.every(word => source.has(word))
}

function stripMarkup(text: string) {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#>*_`~[\]()!|-]/g, ' ')
}

function words(text: string) {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/** Normalises the text of a rendered element into a comparable signature. */
export function normalise(text: string) {
  return words(text).slice(0, 12).join(' ')
}
