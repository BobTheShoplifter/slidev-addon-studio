/**
 * Editing a slide's frontmatter as text.
 *
 * Slidev's slide endpoint accepts two shapes, and they are not equivalent.
 * A `frontmatter` patch updates the server's own resolved copy of the deck, so
 * when the file watcher then re-reads the file it finds nothing changed and
 * never rebuilds the slide: a layout switch appeared to do nothing until the
 * server was restarted. `frontmatterRaw` leaves that copy alone, which is why
 * Slidev's own editor uses it and why the rebuild happens.
 *
 * The raw text is edited line by line rather than re-serialised from an object,
 * so comments, key order and quoting style survive being touched by the editor.
 */

export interface FrontmatterEdit {
  raw: string
  /** Keys that could not be edited safely as text. */
  unhandled: string[]
}

const RE_KEY = /^(\s*)([\w$-]+)\s*:/

/**
 * Applies values to raw frontmatter. A `null` removes the key.
 *
 * Anything whose current value spans more than one line, a nested map or a
 * block scalar, is reported as unhandled rather than guessed at: those are
 * structures a line edit cannot safely rewrite.
 */
export function patchFrontmatterRaw(raw: string, values: Record<string, unknown>): FrontmatterEdit {
  const lines = raw ? raw.split(/\r?\n/) : []
  const unhandled: string[] = []

  for (const [key, value] of Object.entries(values)) {
    // A structure a single line cannot hold. Writing one anyway produced
    // `key: [object Object]`, or a list flattened to `a,b`, which YAML then
    // reads back as an ordinary string.
    if (!isWritable(value)) {
      unhandled.push(key)
      continue
    }

    const index = lines.findIndex((line) => {
      const match = line.match(RE_KEY)
      return !!match && match[1] === '' && match[2] === key
    })

    if (index === -1) {
      if (value !== null && value !== undefined)
        lines.push(`${key}: ${formatValue(value)}`)
      continue
    }

    if (spansMultipleLines(lines, index)) {
      unhandled.push(key)
      continue
    }

    if (value === null || value === undefined)
      lines.splice(index, 1)
    else
      lines[index] = `${key}: ${formatValue(value)}`
  }

  return { raw: lines.join('\n').replace(/^\n+/, '').replace(/\s+$/, ''), unhandled }
}

/** A value continued on following lines, as a nested map or a block scalar. */
function spansMultipleLines(lines: string[], index: number) {
  const value = lines[index].slice(lines[index].indexOf(':') + 1).trim()
  if (value === '' || value === '|' || value === '>' || value.startsWith('|') || value.startsWith('>'))
    return true
  const next = lines[index + 1]
  return !!next && /^\s+\S/.test(next) && !RE_KEY.test(next)
}

/** Whether a value can be written as one line of YAML without losing its type. */
function isWritable(value: unknown): boolean {
  if (value === null || value === undefined)
    return true
  if (Array.isArray(value))
    return value.every(item => ['string', 'number', 'boolean'].includes(typeof item))
  return typeof value !== 'object'
}

/** Quotes only when YAML would otherwise read the value as something else. */
export function formatValue(value: unknown): string {
  if (typeof value === 'boolean' || typeof value === 'number')
    return String(value)

  // A flow sequence, so a list stays a list rather than becoming "a,b".
  if (Array.isArray(value))
    return `[${value.map(item => formatValue(item)).join(', ')}]`

  const text = String(value)
  const needsQuotes = text === ''
    || /^[\s>|*&!%@`{}[\],#?:-]/.test(text)
    || /:\s|\s#/.test(text)
    || /[\n"']/.test(text)
    || /\s$/.test(text)
    || ['true', 'false', 'null', 'yes', 'no', 'on', 'off', '~'].includes(text.toLowerCase())
    || (/^-?\d/.test(text) && !Number.isNaN(Number(text)))

  return needsQuotes ? `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : text
}
