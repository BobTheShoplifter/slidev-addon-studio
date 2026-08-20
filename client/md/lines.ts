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

const RE_ITEM = /^(\s*)([-*+]|\d+[.)])\s+/

/**
 * The lines one list item owns: its own, and anything nested under it.
 *
 * Studio maps an item to the single line it is written on, which is right for
 * selecting and editing it. It is not the right unit to copy or move: a bullet
 * with sub-bullets is one thing to the person looking at it, and leaving the
 * children behind would re-parent them onto whatever ends up above them.
 */
export function listItemUnit(content: string, start: number): SourceRange | null {
  const lines = toLines(content)
  const own = lines[start]?.match(RE_ITEM)
  if (!own)
    return null

  const indent = own[1].length
  let end = start + 1
  while (end < lines.length) {
    const line = lines[end]
    // A blank line ends the list, so it ends the item too.
    if (!line.trim())
      break
    const deeper = (line.match(/^\s*/)?.[0].length ?? 0) > indent
    if (!deeper)
      break
    end++
  }

  return [start, end]
}

/**
 * A copy of a list item, directly under it.
 *
 * Not `insertAfter`: that leaves a blank line, which is what separates two
 * blocks and what ends a list. Used on an item it split the list in two and
 * stripped the copy's indentation, so a sub-bullet came back as a top level
 * one under a different parent.
 */
export function duplicateListItem(content: string, start: number): string | null {
  const unit = listItemUnit(content, start)
  if (!unit)
    return null
  const lines = toLines(content)
  lines.splice(unit[1], 0, ...lines.slice(unit[0], unit[1]))
  return lines.join('\n')
}

/**
 * Swaps a list item with the sibling above or below it.
 *
 * `moveBlock` looks for the next *block*, and from inside a list that is the
 * paragraph after the whole list, so an item moved down jumped over its
 * remaining siblings and landed under a different parent. Siblings are the ones
 * at the same indent, in the same run of list lines.
 */
export function moveListItem(content: string, start: number, direction: -1 | 1): string | null {
  const unit = listItemUnit(content, start)
  if (!unit)
    return null

  const lines = toLines(content)
  const indent = lines[start].match(RE_ITEM)![1].length

  const sibling = (from: number, step: -1 | 1): number | null => {
    for (let i = from; i >= 0 && i < lines.length; i += step) {
      const line = lines[i]
      if (!line.trim())
        return null
      const item = line.match(RE_ITEM)
      const at = (line.match(/^\s*/)?.[0].length ?? 0)
      if (item && at === indent)
        return i
      // A shallower line means the run of siblings has ended.
      if (at < indent)
        return null
    }
    return null
  }

  if (direction === -1) {
    const above = sibling(unit[0] - 1, -1)
    if (above === null)
      return null
    const block = lines.splice(unit[0], unit[1] - unit[0])
    lines.splice(above, 0, ...block)
    return lines.join('\n')
  }

  const below = sibling(unit[1], 1)
  if (below === null)
    return null
  const belowUnit = listItemUnit(content, below)!
  const block = lines.splice(unit[0], unit[1] - unit[0])
  // The lines below shifted up by what was removed.
  const at = belowUnit[1] - (unit[1] - unit[0])
  lines.splice(at, 0, ...block)
  return lines.join('\n')
}

export function append(content: string, text: string): string {
  const body = content.replace(/\s+$/, '')
  return `${body}\n\n${text.trim()}\n`
}

const RE_FENCE = /^\s*(?:```|~~~)/
const RE_OPEN = /<([A-Za-z][\w.-]*)(?:\s[^>]*?)?>/g
const RE_CLOSE = /<\/([A-Za-z][\w.-]*)\s*>/g
const RE_SELF_CLOSING = /<[A-Za-z][\w.-]*(?:\s[^>]*?)?\/>/g
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'track', 'wbr', 'area', 'base', 'col', 'embed', 'param'])

/** How much this line opens (positive) or closes (negative) block markup. */
function tagDelta(line: string): number {
  const withoutSelfClosing = line.replace(RE_SELF_CLOSING, '')
  const opened = [...withoutSelfClosing.matchAll(RE_OPEN)]
    .filter(m => !VOID_TAGS.has(m[1].toLowerCase())).length
  const closed = [...withoutSelfClosing.matchAll(RE_CLOSE)].length
  return opened - closed
}

/**
 * Where the block starting at `start` ends.
 *
 * A blank line usually separates two blocks, but not every blank line does: a
 * `<v-clicks>` wrapper and a fenced code block both contain them. Treating
 * every blank line as a boundary made reordering splice a block into the middle
 * of its neighbour, which is the kind of edit that costs someone a slide.
 */
export function endOfBlock(lines: string[], start: number): number {
  let depth = 0
  let fenced = false
  let i = start
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (RE_FENCE.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced)
      continue
    if (!line.trim() && depth <= 0)
      break
    depth += tagDelta(line)
  }
  return i
}

/** Where the block ending just before `end` starts. */
export function startOfBlock(lines: string[], end: number): number {
  let depth = 0
  let fenced = false
  let i = end
  for (; i > 0; i--) {
    const line = lines[i - 1]
    if (RE_FENCE.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced)
      continue
    if (!line.trim() && depth <= 0)
      break
    depth -= tagDelta(line)
  }
  return i
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

    const neighbourStart = startOfBlock(lines, neighbourEnd)

    const neighbour = lines.slice(neighbourStart, neighbourEnd)
    if (!closes(neighbour))
      return content

    const separator = lines.slice(neighbourEnd, range[0])
    lines.splice(neighbourStart, range[1] - neighbourStart, ...block, ...separator, ...neighbour)
    return lines.join('\n')
  }

  let neighbourStart = range[1]
  while (neighbourStart < lines.length && !lines[neighbourStart].trim())
    neighbourStart += 1
  if (neighbourStart >= lines.length)
    return content

  const neighbourEnd = endOfBlock(lines, neighbourStart)

  const neighbour = lines.slice(neighbourStart, neighbourEnd)
  if (!closes(neighbour))
    return content

  const separator = lines.slice(range[1], neighbourStart)
  lines.splice(range[0], neighbourEnd - range[0], ...neighbour, ...separator, ...block)
  return lines.join('\n')
}

/**
 * Whether these lines open and close everything they contain.
 *
 * A block that sits inside a wrapper has half a wrapper for a neighbour: the
 * lone `<v-drag …>` above it, or the `</v-drag>` below. Swapping with that
 * moves the block out and leaves the wrapper holding nothing, which is how a
 * position ended up on an empty element. Refusing is the only right answer
 * here; a caller that means to move the whole wrapper passes its range.
 */
function closes(lines: string[]): boolean {
  return lines.reduce((depth, line) => depth + tagDelta(line), 0) === 0
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
