/**
 * Finding every tag in a chunk of raw HTML, with the line each one sits on.
 *
 * A Markdown block of raw HTML is a single token, so a grid of twelve
 * components is one block. Annotating only its outermost tag is why clicking a
 * component inside a `<div>` selected the div instead. This walks the block and
 * reports each tag, so every one of them can be traced back to its own line.
 *
 * Deliberately not a real HTML parser: the input is a fragment, frequently
 * contains Vue components and directives, and the only questions asked of it
 * are where a tag starts and which line it is on.
 */

export interface ScannedTag {
  name: string
  /** Line of the opening tag, relative to the start of the block. */
  startLine: number
  /** Line after the element's last line, relative to the start of the block. */
  endLine: number
  /** Offset in the source at which an attribute can be inserted. */
  insertAt: number
  attrs: string
  selfClosing: boolean
}

/**
 * Comments come first so prose inside one is consumed whole. A comment reading
 * `decks/<my-talk>.md` would otherwise have attributes injected into the middle
 * of the sentence.
 */
const RE_TAG = /<!--[\s\S]*?-->|<\/([A-Za-z][\w.-]*)\s*>|<([A-Za-z][\w.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g

/** Elements that never have a closing tag. */
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

/** Elements whose contents are text, not markup, and must not be scanned. */
const RAW_TEXT_TAGS = new Set(['script', 'style', 'pre', 'textarea', 'template'])

export function scanTags(html: string): ScannedTag[] {
  const found: ScannedTag[] = []
  const open: ScannedTag[] = []

  RE_TAG.lastIndex = 0
  let match: RegExpExecArray | null

  // eslint-disable-next-line no-cond-assign
  while ((match = RE_TAG.exec(html))) {
    const [full, closingName, name, attrs, selfClose] = match

    if (closingName) {
      const index = findLast(open, tag => tag.name === closingName)
      if (index >= 0) {
        open[index].endLine = lineAt(html, match.index) + 1
        open.splice(index)
      }
      continue
    }

    if (!name)
      continue

    const startLine = lineAt(html, match.index)
    // An opening tag can span lines, which a list prop written one item per
    // line does routinely. Its element owns at least those lines, or the editor
    // would read back a fragment of its own markup.
    const tagEndLine = lineAt(html, match.index + full.length)
    const tag: ScannedTag = {
      name,
      startLine,
      // Until a closing tag says otherwise, an element owns only its own tag.
      endLine: tagEndLine + 1,
      insertAt: match.index + 1 + name.length + attrs.length,
      attrs,
      selfClosing: selfClose === '/',
    }
    found.push(tag)

    if (RAW_TEXT_TAGS.has(name.toLowerCase())) {
      const close = html.indexOf(`</${name}`, RE_TAG.lastIndex)
      if (close >= 0) {
        tag.endLine = lineAt(html, close) + 1
        RE_TAG.lastIndex = close + name.length + 3
      }
      continue
    }

    if (!tag.selfClosing && !VOID_TAGS.has(name.toLowerCase()))
      open.push(tag)
  }

  return found
}

function lineAt(text: string, index: number) {
  let line = 0
  for (let i = 0; i < index; i++) {
    if (text[i] === '\n')
      line += 1
  }
  return line
}

function findLast<T>(items: T[], predicate: (item: T) => boolean) {
  for (let i = items.length - 1; i >= 0; i--) {
    if (predicate(items[i]))
      return i
  }
  return -1
}
