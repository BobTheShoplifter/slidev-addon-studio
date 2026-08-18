/**
 * Line-accurate slide splitting for a Slidev Markdown file.
 *
 * Deck-level edits (insert / delete / duplicate / move a slide) rewrite the
 * `.md` file itself, so they must work on what is on disk right now, not on
 * the dev server's in-memory copy which may be a beat behind. This is a
 * faithful port of the scanner in `@slidev/parser` (`parseSync`), kept local
 * so the addon has no version-coupled dependency on parser internals.
 */

const RE_LEADING_BACKTICKS = /^\s*`+/
const RE_CRLF = /\r?\n/

export interface RawSlide {
  /** Zero-based index of the slide within the file. */
  index: number
  /** First line of the slide, inclusive. */
  start: number
  /** First line after the slide's frontmatter block. */
  contentStart: number
  /** Line after the last line of the slide, exclusive. */
  end: number
  /** The slide's full source, frontmatter included. */
  raw: string
}

export interface RawDeck {
  raw: string
  lines: string[]
  slides: RawSlide[]
}

/** Tracks whether a line leaves us inside an HTML comment (presenter notes). */
function advanceHtmlCommentState(line: string, inHtmlComment: boolean) {
  let cursor = 0
  while (cursor < line.length) {
    if (inHtmlComment) {
      const end = line.indexOf('-->', cursor)
      if (end < 0)
        return true
      inHtmlComment = false
      cursor = end + 3
    }
    else {
      const start = line.indexOf('<!--', cursor)
      if (start < 0)
        return false
      const end = line.indexOf('-->', start + 4)
      if (end < 0)
        return true
      cursor = end + 3
    }
  }
  return inHtmlComment
}

export function splitDeck(markdown: string): RawDeck {
  const lines = markdown.split(RE_CRLF)
  const slides: RawSlide[] = []
  let start = 0
  let contentStart = 0
  let inHtmlComment = false

  function slice(end: number) {
    if (start === end)
      return
    slides.push({
      index: slides.length,
      start,
      contentStart,
      end,
      raw: lines.slice(start, end).join('\n'),
    })
    start = end + 1
    contentStart = end + 1
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const line = rawLine.trimEnd()

    if (inHtmlComment) {
      inHtmlComment = advanceHtmlCommentState(rawLine, true)
      continue
    }

    if (line.startsWith('---')) {
      slice(i)
      const next = lines[i + 1]
      // `---` immediately followed by content opens a frontmatter block;
      // `----` and friends are horizontal rules, not separators.
      if (line[3] !== '-' && next?.trim()) {
        start = i
        for (i += 1; i < lines.length; i++) {
          if (lines[i].trimEnd() === '---')
            break
        }
        contentStart = i + 1
      }
    }
    else if (line.trimStart().startsWith('```')) {
      const fence = line.match(RE_LEADING_BACKTICKS)![0]
      let j = i + 1
      for (; j < lines.length; j++) {
        if (lines[j].startsWith(fence))
          break
      }
      if (j !== lines.length)
        i = j
    }
    else {
      inHtmlComment = advanceHtmlCommentState(rawLine, false)
    }
  }

  if (start <= lines.length - 1)
    slice(lines.length)

  return { raw: markdown, lines, slides }
}

/**
 * Reassemble a deck from slide sources, restoring the `---` separators.
 *
 * Mirrors `stringify`/`stringifySlide` in `@slidev/parser`: a slide whose
 * source already opens with `---` carries its own frontmatter, and that
 * delimiter doubles as the separator. The first slide never gets one, because its
 * frontmatter is the deck headmatter.
 */
export function joinDeck(slideRaws: string[]): string {
  const parts = slideRaws.map((raw, idx) => {
    if (idx === 0 || raw.startsWith('---'))
      return raw
    return `---\n${raw.startsWith('\n') ? raw : `\n${raw}`}`
  })
  return `${parts.join('\n').trim()}\n`
}

/** Normalise a slide body the way Slidev's `prettifySlide` does. */
export function prettifyRaw(frontmatterRaw: string | undefined, content: string, note?: string) {
  const body = content.trim() ? `\n${content.trim()}\n` : ''
  let raw = frontmatterRaw?.trim()
    ? `---\n${frontmatterRaw.trim()}\n---\n${body}`
    : body
  if (note?.trim())
    raw += `\n<!--\n${note.trim()}\n-->\n`
  return raw
}
