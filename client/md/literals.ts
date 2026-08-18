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
        value += text[i + 1] ?? ''
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

  const quoted = items.map(item => `'${item.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}'`)
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
