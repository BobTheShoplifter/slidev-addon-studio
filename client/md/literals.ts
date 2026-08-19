/**
 * Reading and writing the array literals that live inside a bound prop, such as
 * `:tells="['Avsender-domenet er feil', 'Lenka peker et annet sted']"`.
 *
 * Deliberately not `eval` or `new Function`: this parses source the user is
 * editing, and an editor should never execute it to display it. The parser
 * handles arrays of strings, which is what a list of options or a palette is.
 * Anything richer, an array of objects for instance, is reported as unparsed so
 * the inspector can fall back to a plain text field rather than mangling it.
 */

/**
 * Decodes the escape after a backslash in a JavaScript string literal.
 *
 * Taking the character as written deleted the backslash and kept the letter, so
 * a list item reading `Line one\nLine two` came back as `Line onenLine two` and
 * was written back that way: an edit to one item silently rewrote the others.
 */
function decodeEscape(char: string): string {
  switch (char) {
    case 'n': return '\n'
    case 't': return '\t'
    case 'r': return '\r'
    case 'b': return '\b'
    case 'f': return '\f'
    case 'v': return '\v'
    case '0': return '\0'
    default: return char
  }
}

/** Writes a value as a single-quoted literal that JavaScript can read back. */
function quote(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\\\'')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  return `'${escaped}'`
}

export function parseStringArray(raw: string | null | undefined): string[] | null {
  if (!raw)
    return null

  const text = raw.trim()
  if (!text.startsWith('[') || !text.endsWith(']'))
    return null

  const items: string[] = []
  let i = 1

  while (i < text.length - 1) {
    const char = text[i]

    if (char === ',' || /\s/.test(char)) {
      i += 1
      continue
    }

    if (char !== '\'' && char !== '"' && char !== '`')
      return null

    const quote = char
    let value = ''
    i += 1

    while (i < text.length) {
      if (text[i] === '\\') {
        value += decodeEscape(text[i + 1] ?? '')
        i += 2
        continue
      }
      if (text[i] === quote) {
        i += 1
        break
      }
      value += text[i]
      i += 1
    }

    items.push(value)
  }

  return items
}

/**
 * Formats an array back into an attribute value.
 *
 * Long lists are written one per line, which is how people write them by hand
 * and what keeps a diff readable when a single option changes.
 */
export function formatStringArray(items: string[], indent = '  '): string {
  if (!items.length)
    return '[]'

  const quoted = items.map(item => quote(item))
  const inline = `[${quoted.join(', ')}]`
  if (items.length <= 2 && inline.length <= 60)
    return inline

  return `[\n${quoted.map(q => `${indent}${q},`).join('\n')}\n]`
}

/** Whether a prop's declared type is an array. */
export function isArrayType(type: string | undefined) {
  const value = (type ?? '').trim().toLowerCase()
  return value.endsWith('[]') || value.startsWith('array')
}

/** Whether a value can be shown as a colour swatch. */
export function isColorValue(value: string) {
  const text = value.trim()
  return /^#[0-9a-f]{3,8}$/i.test(text)
    || /^(?:rgb|hsl|oklch|lab|color)a?\(/i.test(text)
    || /^var\(--[\w-]+\)$/.test(text)
}

export type Primitive = string | number | boolean
export type ObjectRow = Record<string, Primitive>

/**
 * Reads an array of flat object literals, which is what a timeline's entries or
 * a terminal demo's steps are.
 *
 * Same principle as the string form: parse rather than evaluate, and report
 * anything richer as unparsed so the inspector falls back to a text field
 * instead of rewriting a structure it did not understand.
 */
export function parseObjectArray(raw: string | null | undefined): ObjectRow[] | null {
  if (!raw)
    return null

  const text = raw.trim()
  if (!text.startsWith('[') || !text.endsWith(']'))
    return null

  const rows: ObjectRow[] = []
  for (const entry of splitTopLevel(text.slice(1, -1))) {
    if (!entry.startsWith('{') || !entry.endsWith('}'))
      return null

    const row: ObjectRow = {}
    for (const pair of splitTopLevel(entry.slice(1, -1))) {
      const separator = pair.indexOf(':')
      if (separator === -1)
        return null

      const key = pair.slice(0, separator).trim().replace(/^['"`]|['"`]$/g, '')
      const value = readPrimitive(pair.slice(separator + 1).trim())
      if (!/^\w[\w-]*$/.test(key) || value === undefined)
        return null

      row[key] = value
    }
    rows.push(row)
  }

  return rows
}

function readPrimitive(text: string): Primitive | undefined {
  if (/^'(?:[^'\\]|\\.)*'$/.test(text) || /^"(?:[^"\\]|\\.)*"$/.test(text))
    return text.slice(1, -1).replace(/\\(.)/g, (_, char) => decodeEscape(char))
  if (text === 'true' || text === 'false')
    return text === 'true'
  if (/^-?\d+(?:\.\d+)?$/.test(text))
    return Number(text)
  return undefined
}

/** Writes rows back, one per line, which is how people write them by hand. */
export function formatObjectArray(rows: ObjectRow[], indent = '  '): string {
  if (!rows.length)
    return '[]'

  const rendered = rows.map((row) => {
    const pairs = Object.entries(row)
      .filter(([, value]) => value !== '' && value !== undefined)
      .map(([key, value]) => `${key}: ${writePrimitive(value)}`)
    return `${indent}{ ${pairs.join(', ')} },`
  })

  return `[\n${rendered.join('\n')}\n]`
}

function writePrimitive(value: Primitive): string {
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  return quote(value)
}

/** Splits on commas that are not inside a string, bracket or brace. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0

  for (let i = 0; i < body.length; i++) {
    const char = body[i]

    if (quote) {
      if (char === '\\')
        i += 1
      else if (char === quote)
        quote = null
      continue
    }

    if (char === '\'' || char === '"' || char === '`')
      quote = char
    else if ('([{'.includes(char))
      depth += 1
    else if (')]}'.includes(char))
      depth -= 1
    else if (char === ',' && depth === 0) {
      parts.push(body.slice(start, i))
      start = i + 1
    }
  }

  parts.push(body.slice(start))
  return parts.map(part => part.trim()).filter(Boolean)
}
