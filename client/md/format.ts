/**
 * The formatting actions behind the inline editor's toolbar.
 *
 * They work on Markdown text and a selection range, not on rendered HTML.
 * Converting HTML back to Markdown is where visual editors usually start
 * losing things, and a deck is full of components and directives that no such
 * converter would survive. Wrapping the selected characters in the syntax the
 * author would have typed keeps the file theirs.
 */

export interface Selection {
  text: string
  start: number
  end: number
}

export interface FormatResult {
  text: string
  start: number
  end: number
}

/** Wraps the selection in a marker, or unwraps it if it is already wrapped. */
export function toggleWrap(selection: Selection, marker: string): FormatResult {
  const { text, start, end } = selection
  const before = text.slice(0, start)
  const inner = text.slice(start, end)
  const after = text.slice(end)

  // A run has to match this marker exactly. Asking for italic inside `**bold**`
  // used to strip one star from each side, which turned the bold into italic
  // rather than nesting the two.
  const symbol = marker[0]
  const wrapsExactly = (left: string, right: string) =>
    trailingRun(left, symbol) === marker.length && leadingRun(right, symbol) === marker.length

  if (inner.length >= marker.length * 2 && inner.startsWith(marker) && inner.endsWith(marker)
    && leadingRun(inner, symbol) === marker.length && trailingRun(inner, symbol) === marker.length) {
    const stripped = inner.slice(marker.length, inner.length - marker.length)
    return { text: before + stripped + after, start, end: start + stripped.length }
  }

  if (before.endsWith(marker) && after.startsWith(marker) && wrapsExactly(before, after)) {
    const trimmedBefore = before.slice(0, before.length - marker.length)
    const trimmedAfter = after.slice(marker.length)
    return {
      text: trimmedBefore + inner + trimmedAfter,
      start: start - marker.length,
      end: end - marker.length,
    }
  }

  const wrapped = marker + inner + marker
  return { text: before + wrapped + after, start: start + marker.length, end: end + marker.length }
}

function leadingRun(text: string, char: string): number {
  let n = 0
  while (n < text.length && text[n] === char)
    n += 1
  return n
}

function trailingRun(text: string, char: string): number {
  let n = 0
  while (n < text.length && text[text.length - 1 - n] === char)
    n += 1
  return n
}

/** Turns the selection into a link, keeping it as the link text. */
export function toLink(selection: Selection, href = 'https://'): FormatResult {
  const { text, start, end } = selection
  const inner = text.slice(start, end) || 'text'
  const markup = `[${inner}](${href})`
  return {
    text: text.slice(0, start) + markup + text.slice(end),
    // Leave the cursor on the URL, which is the part still to be filled in.
    start: start + inner.length + 3,
    end: start + markup.length - 1,
  }
}

/** Sets, or removes, a heading level on every line the selection touches. */
export function toggleHeading(selection: Selection, level: number): FormatResult {
  return mapLines(selection, (line) => {
    const body = line.replace(/^#{1,6}\s+/, '')
    const current = line.match(/^(#{1,6})\s/)?.[1].length ?? 0
    return current === level ? body : `${'#'.repeat(level)} ${body}`
  })
}

/** Toggles a bullet on every line the selection touches. */
export function toggleBullet(selection: Selection): FormatResult {
  const lines = linesOf(selection)
  const allBulleted = lines.every(line => /^\s*[-*+]\s/.test(line) || !line.trim())
  return mapLines(selection, line =>
    allBulleted ? line.replace(/^(\s*)[-*+]\s+/, '$1') : line.trim() ? `- ${line}` : line)
}

/** Toggles a quote marker on every line the selection touches. */
export function toggleQuote(selection: Selection): FormatResult {
  const lines = linesOf(selection)
  const allQuoted = lines.every(line => /^\s*>\s?/.test(line) || !line.trim())
  return mapLines(selection, line =>
    allQuoted ? line.replace(/^(\s*)>\s?/, '$1') : line.trim() ? `> ${line}` : line)
}

function bounds(selection: Selection) {
  const start = selection.text.lastIndexOf('\n', selection.start - 1) + 1
  const lineEnd = selection.text.indexOf('\n', selection.end)
  const end = lineEnd === -1 ? selection.text.length : lineEnd
  return { start, end }
}

function linesOf(selection: Selection) {
  const { start, end } = bounds(selection)
  return selection.text.slice(start, end).split('\n')
}

function mapLines(selection: Selection, transform: (line: string) => string): FormatResult {
  const { start, end } = bounds(selection)
  const replaced = selection.text.slice(start, end).split('\n').map(transform).join('\n')
  return {
    text: selection.text.slice(0, start) + replaced + selection.text.slice(end),
    start,
    end: start + replaced.length,
  }
}
