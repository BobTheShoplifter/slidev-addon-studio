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
export function serialiseBlock(root: InlineElement, shape: BlockShape): string | null {
  if (!shape.perLine) {
    const inner = serialiseInline(root)
    return inner === null ? null : shape.prefix + inner.trim()
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
