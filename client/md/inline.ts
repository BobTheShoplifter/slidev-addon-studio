/**
 * Turning a rendered block back into the Markdown that produced it.
 *
 * This is what lets the editor be what the slide already looks like: the block
 * itself is made editable where it sits, in the deck's own fonts and colours,
 * and what comes back has to be Markdown again.
 *
 * The rule that keeps that safe is that this refuses far more than it accepts.
 * A visual editor earns its keep on ordinary prose; the moment a block holds
 * something whose Markdown cannot be reconstructed with certainty, a component,
 * a styled span, an equation, anything at all it does not recognise, it says so
 * and the caller edits the Markdown instead. Losing a component to a round trip
 * is not a trade worth making for convenience.
 */

/** What kind of block the visual editor is allowed to touch. */
export type EditableKind = 'heading' | 'paragraph' | 'quote' | 'list'

export interface BlockShape {
  kind: EditableKind
  /** Markdown that precedes the text on every line, e.g. `## ` or `- `. */
  prefix: string
  /** Whether each rendered child line carries its own prefix. */
  perLine: boolean
}

const RE_HEADING = /^(#{1,6}\s+)/
const RE_BULLET = /^(\s*[-*+]\s+)/
const RE_ORDERED = /^(\s*\d+[.)]\s+)/
const RE_QUOTE = /^(>\s*)/

/**
 * Reads the Markdown skeleton of a block: the markers that make it a heading,
 * a list or a quote rather than a paragraph.
 *
 * Only the text between those markers is ever edited visually, so the block
 * keeps being what it was: editing a heading cannot accidentally turn it into
 * a paragraph, and a list keeps its markers even if every word changes.
 */
export function blockShape(source: string): BlockShape | null {
  const lines = source.split('\n')
  const first = lines[0] ?? ''

  const heading = first.match(RE_HEADING)
  if (heading)
    return lines.length === 1 ? { kind: 'heading', prefix: heading[1], perLine: false } : null

  const quote = first.match(RE_QUOTE)
  if (quote)
    return { kind: 'quote', prefix: quote[1], perLine: true }

  const bullet = first.match(RE_BULLET) ?? first.match(RE_ORDERED)
  if (bullet) {
    // Every line has to be an item of the same list, or the markers this would
    // write back are not the markers that were there.
    const allItems = lines.every(line => RE_BULLET.test(line) || RE_ORDERED.test(line))
    return allItems ? { kind: 'list', prefix: bullet[1], perLine: true } : null
  }

  // A paragraph is anything left that is not markup of its own.
  if (/^\s*[<`|:]/.test(first) || /^\s*$/.test(first))
    return null
  return { kind: 'paragraph', prefix: '', perLine: false }
}

const ELEMENT_NODE = 1
const TEXT_NODE = 3

/**
 * The parts of a DOM node this actually walks.
 *
 * Structural rather than `Node` and `Element`, so the walking can be tested
 * without pulling a DOM implementation into the test run. A real element
 * satisfies these already.
 */
export interface InlineNode {
  nodeType: number
  textContent: string | null
}

export interface InlineElement extends InlineNode {
  tagName: string
  childNodes: Iterable<InlineNode>
  children: Iterable<InlineElement>
  attributes: Iterable<{ name: string }>
  getAttribute: (name: string) => string | null
}

/** Elements that carry meaning Markdown can write back. */
const MARKS: Record<string, (inner: string, el: InlineElement) => string> = {
  strong: inner => `**${inner}**`,
  b: inner => `**${inner}**`,
  em: inner => `*${inner}*`,
  i: inner => `*${inner}*`,
  s: inner => `~~${inner}~~`,
  del: inner => `~~${inner}~~`,
  strike: inner => `~~${inner}~~`,
  code: inner => `\`${inner}\``,
  // Markdown has no underline. It renders inline HTML, so that is what an
  // underline is written back as, which is also what the deck already had if it
  // was written by hand.
  u: inner => `<u>${inner}</u>`,
  a: (inner, el) => `[${inner}](${el.getAttribute('href') ?? ''})`,
  img: (_inner, el) => `![${el.getAttribute('alt') ?? ''}](${el.getAttribute('src') ?? ''})`,
  br: () => '<br>',
}

/** Wrappers the renderer adds that mean nothing on their own. */
const TRANSPARENT = new Set(['span', 'font'])

/** Attributes that are the editor's own bookkeeping, not the author's markup. */
const OURS = /^data-studio-/

function isPlain(el: InlineElement): boolean {
  return [...el.attributes].every(attr => OURS.test(attr.name))
}

/** Characters that would otherwise start a construct where they stand. */
function escapeText(text: string): string {
  return text.replace(/([\\`*_[\]])/g, '\\$1')
}

/**
 * Serialises the inline content of one rendered element.
 *
 * Returns `null` the moment it meets anything it cannot write back exactly:
 * a component, a styled span, an element it does not know. The caller falls
 * back to editing the Markdown, which loses nothing.
 */
export function serialiseInline(root: { childNodes: Iterable<InlineNode> }): string | null {
  let out = ''

  for (const node of root.childNodes) {
    // Numeric rather than `Node.TEXT_NODE`, so this stays a pure function that
    // runs anywhere, tests included.
    if (node.nodeType === TEXT_NODE) {
      out += escapeText(node.textContent ?? '')
      continue
    }

    if (node.nodeType !== ELEMENT_NODE)
      continue

    const el = node as InlineElement
    const tag = el.tagName.toLowerCase()

    if (tag === 'br' || tag === 'img') {
      out += MARKS[tag]('', el)
      continue
    }

    // A wrapper the renderer added carries nothing of its own, but one the
    // author styled does, and dropping it would delete their markup.
    if (TRANSPARENT.has(tag)) {
      if (!isPlain(el))
        return null
      const inner = serialiseInline(el)
      if (inner === null)
        return null
      out += inner
      continue
    }

    const mark = MARKS[tag]
    if (!mark)
      return null

    // A link keeps its address; the rest carry nothing but their own markers.
    if (tag !== 'a' && !isPlain(el))
      return null

    const inner = serialiseInline(el)
    if (inner === null)
      return null

    // Code spans are literal: escaping inside one would show the backslashes.
    out += mark(tag === 'code' ? (el.textContent ?? '') : inner, el)
  }

  return out
}

/**
 * Serialises a whole block back to Markdown, markers and all.
 *
 * `perLine` blocks, a list or a quote, have one rendered child per line, so
 * each child is serialised on its own and given the block's marker back.
 */
/**
 * A list, however deep it goes.
 *
 * The flat version asked the inline serialiser to write a whole `<li>`, and an
 * item holding a nested list contains a `<ul>`, which is not an inline mark, so
 * it refused and the block fell back to editing raw Markdown. Splitting each
 * item into the text it owns and the lists hanging off it lets both be written:
 * the text through the same inline path as everything else, the sub-lists by
 * coming back here one level further in.
 *
 * Two spaces per level, which is what the template's own decks are written with
 * and what CommonMark reads back as the same nesting.
 */
function serialiseList(root: InlineElement, marker: string, depth: number, base: string): string[] | null {
  const lines: string[] = []
  const pad = base + '  '.repeat(depth)
  // An ordered list is written back numbered from one. Repeating the first
  // marker renders the same, but it would not match the source it came from,
  // and the round trip check would refuse to edit the block at all.
  const ordered = /^\d+[.)]$/.test(marker)
  let n = Number.parseInt(marker, 10) || 1

  for (const item of root.children) {
    const tag = item.tagName.toLowerCase()

    // A browser indents an item by putting the sub-list beside it rather than
    // inside it, which is what `execCommand('indent')` produces and what Tab
    // therefore builds. It means the same thing, one level in, and refusing it
    // meant the whole edit was thrown away the moment anyone pressed Tab.
    if (tag === 'ul' || tag === 'ol') {
      const beside = serialiseList(item, tag === 'ol' ? '1.' : '-', depth + 1, base)
      if (beside === null)
        return null
      lines.push(...beside)
      continue
    }

    if (tag !== 'li')
      return null

    const own: InlineNode[] = []
    const nested: InlineElement[] = []
    for (const node of item.childNodes) {
      const tag = (node as InlineElement).tagName?.toLowerCase()
      if (tag === 'ul' || tag === 'ol')
        nested.push(node as InlineElement)
      else
        own.push(node)
    }

    const text = serialiseInline({ childNodes: own })
    if (text === null)
      return null
    const bullet = ordered ? `${n++}${marker.slice(-1)}` : marker
    lines.push(`${pad}${bullet} ${text.trim()}`.trimEnd())

    for (const child of nested) {
      // A sub-list is written as what it is. Passing the parent's marker down
      // turned an ordered list nested inside a bulleted one back into bullets.
      const childMarker = child.tagName.toLowerCase() === 'ol' ? '1.' : '-'
      const deeper = serialiseList(child, childMarker, depth + 1, base)
      if (deeper === null)
        return null
      lines.push(...deeper)
    }
  }

  return lines
}

export function serialiseBlock(root: InlineElement, shape: BlockShape): string | null {
  if (!shape.perLine) {
    const inner = serialiseInline(root)
    return inner === null ? null : shape.prefix + inner.trim()
  }

  if (shape.kind === 'list') {
    // The prefix carries the indentation the block already sits at, which is
    // not always none: a list nested inside another one is handed over on its
    // own, and writing it back flush left would pull it out of its parent.
    const base = shape.prefix.match(/^\s*/)?.[0] ?? ''
    const nested = serialiseList(root, shape.prefix.trim(), 0, base)
    return nested && nested.length ? nested.join('\n') : null
  }

  const lines: string[] = []
  for (const child of root.children) {
    // A quote renders its lines as paragraphs, a list as items; either way one
    // element is one line of Markdown.
    const inner = serialiseInline(child)
    if (inner === null)
      return null
    lines.push(shape.prefix + inner.trim())
  }

  if (!lines.length) {
    const inner = serialiseInline(root)
    return inner === null ? null : shape.prefix + inner.trim()
  }

  return lines.join('\n')
}

/**
 * Whether the block can be handed to the visual editor at all.
 *
 * Not "did the serialiser return something", which only says it recognised
 * every tag: it also has to reproduce the Markdown that is already there. A
 * blockquote holding two paragraphs comes back as two `>` lines with the blank
 * one between them gone, which reads the same to the serialiser and renders as
 * one paragraph in the deck. Comparing against the source catches that whole
 * class of near-miss before anything is edited.
 *
 * The comparison ignores escaping and runs of whitespace, since writing `2 \* 3`
 * for `2 * 3` is a faithful round trip, not a difference.
 */
/**
 * The Markdown block a rendered element stands for, read from the element.
 *
 * `blockShape` works the other way round, from source, which is what a single
 * block needs. A container holds several blocks whose source is not split up
 * yet, so each child has to say for itself what it is.
 */
function shapeOfElement(el: InlineElement): BlockShape | null {
  const tag = el.tagName.toLowerCase()
  const heading = tag.match(/^h([1-6])$/)
  if (heading)
    return { kind: 'heading', prefix: `${'#'.repeat(Number(heading[1]))} `, perLine: false }
  if (tag === 'ul')
    return { kind: 'list', prefix: '- ', perLine: true }
  if (tag === 'ol')
    return { kind: 'list', prefix: '1. ', perLine: true }
  if (tag === 'blockquote')
    return { kind: 'quote', prefix: '> ', perLine: true }
  if (tag === 'p')
    return { kind: 'paragraph', prefix: '', perLine: false }
  return null
}

/**
 * A run of blocks, written back as the Markdown they came from.
 *
 * This is what makes a slot behave like a text box rather than like a row of
 * separate fields. Handing the browser the container means Enter, splitting a
 * paragraph, leaving a list and selecting across two paragraphs are all things
 * it already does; all that is needed here is to write the result back, one
 * block per child, with the blank line between them that keeps them separate.
 *
 * Anything the block serialiser does not recognise refuses the whole container,
 * which is what keeps a component or a shape from being flattened into a
 * paragraph by an edit that was only meant to fix a typo.
 */
export function serialiseContainer(
  root: InlineElement,
  /**
   * The Markdown a child stands for when it is not text at all.
   *
   * A slot usually holds a component or two among its paragraphs, and refusing
   * the whole container for them would mean this almost never applies to a real
   * slide. They are handed back their own source instead, so they survive an
   * edit to the text around them, and a child that has been deleted outright is
   * simply not asked about and disappears from the Markdown, which is what
   * deleting it should do.
   */
  verbatim?: (child: InlineElement) => string | null,
): string | null {
  const blocks: string[] = []

  for (const child of root.children) {
    const shape = shapeOfElement(child)

    if (!shape) {
      const raw = verbatim?.(child)
      if (raw == null)
        return null
      if (raw.trim())
        blocks.push(raw.trim())
      continue
    }

    const written = serialiseBlock(child, shape)
    if (written === null)
      return null
    if (written.trim())
      blocks.push(written)
  }

  return blocks.length ? blocks.join('\n\n') : null
}

/** Whether a whole container can be handed over and written back unchanged. */
export function canEditContainer(
  source: string,
  root: InlineElement,
  verbatim?: (child: InlineElement) => string | null,
): boolean {
  const written = serialiseContainer(root, verbatim)
  return written !== null && plain(written) === plain(source)
}

export function canEditVisually(source: string, root: InlineElement, shape: BlockShape): boolean {
  const written = serialiseBlock(root, shape)
  return written !== null && plain(written) === plain(source)
}

/** Markdown reduced to what it says, so escaping and spacing do not count. */
function plain(markdown: string): string {
  return markdown
    .replace(/\\([\\`*_[\]])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
