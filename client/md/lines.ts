import type { SourceRange } from '../types'

/**
 * Line-level surgery on a slide's Markdown content.
 *
 * Studio never rewrites a whole slide: it replaces the exact lines a block
 * occupies. That keeps diffs small and leaves the rest of the slide, including
 * formatting the user cares about, untouched.
 */

export function toLines(content: string) {
  return content.split(/\r?\n/)
}

export function getBlock(content: string, range: SourceRange): string {
  return toLines(content).slice(range[0], range[1]).join('\n')
}

export function replaceBlock(content: string, range: SourceRange, next: string): string {
  const lines = toLines(content)
  lines.splice(range[0], range[1] - range[0], ...toLines(next))
  return lines.join('\n')
}

export function removeBlock(content: string, range: SourceRange): string {
  const lines = toLines(content)
  lines.splice(range[0], range[1] - range[0])
  // Collapse the hole left behind so we do not accumulate blank lines.
  while (lines[range[0]] === '' && lines[range[0] - 1] === '')
    lines.splice(range[0], 1)
  return lines.join('\n')
}

export function insertAfter(content: string, range: SourceRange, text: string): string {
  const lines = toLines(content)
  lines.splice(range[1], 0, '', ...toLines(text.trim()))
  return lines.join('\n')
}

export function insertBefore(content: string, range: SourceRange, text: string): string {
  const lines = toLines(content)
  lines.splice(range[0], 0, ...toLines(text.trim()), '')
  return lines.join('\n')
}

export function append(content: string, text: string): string {
  const body = content.replace(/\s+$/, '')
  return `${body}\n\n${text.trim()}\n`
}

/**
 * Swaps a block with its neighbour.
 *
 * The blank lines between the two are left exactly where they are and only the
 * blocks themselves change places, so reordering never quietly reformats the
 * whitespace an author chose.
 */
export function moveBlock(content: string, range: SourceRange, direction: -1 | 1): string {
  const lines = toLines(content)
  const block = lines.slice(range[0], range[1])

  if (direction < 0) {
    let neighbourEnd = range[0]
    while (neighbourEnd > 0 && !lines[neighbourEnd - 1].trim())
      neighbourEnd -= 1
    if (neighbourEnd === 0)
      return content

    let neighbourStart = neighbourEnd
    while (neighbourStart > 0 && lines[neighbourStart - 1].trim())
      neighbourStart -= 1

    const neighbour = lines.slice(neighbourStart, neighbourEnd)
    const separator = lines.slice(neighbourEnd, range[0])
    lines.splice(neighbourStart, range[1] - neighbourStart, ...block, ...separator, ...neighbour)
    return lines.join('\n')
  }

  let neighbourStart = range[1]
  while (neighbourStart < lines.length && !lines[neighbourStart].trim())
    neighbourStart += 1
  if (neighbourStart >= lines.length)
    return content

  let neighbourEnd = neighbourStart
  while (neighbourEnd < lines.length && lines[neighbourEnd].trim())
    neighbourEnd += 1

  const neighbour = lines.slice(neighbourStart, neighbourEnd)
  const separator = lines.slice(range[1], neighbourStart)
  lines.splice(range[0], neighbourEnd - range[0], ...neighbour, ...separator, ...block)
  return lines.join('\n')
}

/**
 * Removes a pair of wrapper tag lines around a block and the blank lines that
 * only existed to separate the block from them.
 *
 * Wrapping writes five lines where there was one; unwrapping has to take all
 * four back, or every animation toggled on and off again would leave the deck
 * a little more padded than before.
 *
 * Returns the new content and how many lines vanished above the block, which
 * callers need to keep their ranges pointing at the right place.
 */
export function unwrap(content: string, open: number, close: number): { content: string, removedAbove: number } {
  const lines = toLines(content)
  let removedAbove = 0

  const isBlank = (index: number) => lines[index] !== undefined && !lines[index].trim()

  lines.splice(close, 1)
  if (isBlank(close - 1) && (isBlank(close) || close >= lines.length))
    lines.splice(close - 1, 1)

  lines.splice(open, 1)
  removedAbove += 1
  if (isBlank(open) && (isBlank(open - 1) || open === 0)) {
    lines.splice(open, 1)
    removedAbove += 1
  }

  return { content: lines.join('\n'), removedAbove }
}
