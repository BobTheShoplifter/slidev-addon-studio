/**
 * Reading and rewriting attributes on the opening tag of an HTML or component
 * block. Studio uses this instead of a real HTML parser because it must round
 * trip the author's exact formatting: only the attribute being changed moves.
 */

export interface TagInfo {
  name: string
  /** Index of `<` in the block. */
  start: number
  /** Index just past `>` in the block. */
  end: number
  attrs: string
  attrsStart: number
  attrsEnd: number
  selfClosing: boolean
}

const RE_OPEN_TAG = /<([A-Za-z][\w.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/

/**
 * Whether the block *is* an element, rather than merely containing one.
 *
 * A block nested inside a raw HTML block is indented, so "the tag starts at
 * index 0" is the wrong test: it silently sends every nested component down the
 * Markdown-wrapper path, which splices blank lines into the parent block and
 * breaks it. Leading whitespace is the only thing allowed in front.
 */
export function opensWithTag(block: string): TagInfo | null {
  const tag = firstTag(block)
  if (!tag)
    return null
  return block.slice(0, tag.start).trim() === '' ? tag : null
}

export function firstTag(block: string): TagInfo | null {
  const match = block.match(RE_OPEN_TAG)
  if (!match || match.index === undefined)
    return null
  const [full, name, attrs, selfClosing] = match
  const attrsStart = match.index + 1 + name.length
  return {
    name,
    start: match.index,
    end: match.index + full.length,
    attrs,
    attrsStart,
    attrsEnd: attrsStart + attrs.length,
    selfClosing: selfClosing === '/',
  }
}

export interface Attr {
  /** Attribute as written, e.g. `v-click.hide` or `:pos`. */
  raw: string
  /** Name without binding prefix or modifiers, e.g. `v-click`, `pos`. */
  name: string
  modifiers: string[]
  bound: boolean
  value: string | null
  start: number
  end: number
}

const RE_ATTR = /([@:.]?[\w@:.\-[\]]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g

export function parseAttrs(attrs: string, offset = 0): Attr[] {
  const result: Attr[] = []
  for (const match of attrs.matchAll(RE_ATTR)) {
    const [full, raw, rawValue] = match
    const index = match.index ?? 0
    const bound = raw.startsWith(':') || raw.startsWith('v-bind:')
    const withoutBinding = raw.replace(/^:|^v-bind:/, '')
    const [name, ...modifiers] = withoutBinding.startsWith('v-')
      ? withoutBinding.split('.')
      : [withoutBinding]
    result.push({
      raw,
      name: withoutBinding.startsWith('v-') ? name : withoutBinding,
      modifiers,
      bound,
      value: rawValue ? stripQuotes(rawValue) : null,
      start: offset + index,
      end: offset + index + full.length,
    })
  }
  return result
}

function stripQuotes(value: string) {
  return /^["']/.test(value) ? value.slice(1, -1) : value
}

/**
 * Vue accepts a prop written either way, and component docs usually teach the
 * kebab-case form, so `click-to-play` and `clickToPlay` have to be understood
 * as the same attribute. Reading only one spelling made the inspector report a
 * set prop as unset and then write a second, duplicate one.
 */
export function sameAttr(a: string, b: string) {
  const plain = (name: string) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).toLowerCase()
  return plain(a) === plain(b)
}

export function findAttr(block: string, name: string): Attr | null {
  const tag = firstTag(block)
  if (!tag)
    return null
  return parseAttrs(tag.attrs, tag.attrsStart).find(a => sameAttr(a.name, name)) ?? null
}

export interface WriteAttrOptions {
  /** Write as `:name="value"` rather than `name="value"`. */
  bound?: boolean
  modifiers?: string[]
}

/**
 * Sets, replaces or removes an attribute on the block's opening tag.
 * Passing `value: null` and no modifiers removes it.
 */
export function writeAttr(
  block: string,
  name: string,
  value: string | true | null,
  options: WriteAttrOptions = {},
): string {
  const tag = firstTag(block)
  if (!tag)
    return block

  const existing = parseAttrs(tag.attrs, tag.attrsStart).find(a => sameAttr(a.name, name))
  // Keep whichever spelling the author used, so editing a prop does not rewrite
  // their markup into a different convention.
  const written = existing?.name ?? name
  const next = value === null ? '' : renderAttr(written, value, options)

  if (existing) {
    if (!next) {
      // Rebuild the attribute region and nothing else. Tidying the whole block
      // with `.replace(/\s+>/, '>')` reached past the tag: on a block whose body
      // reads "5 > 3", removing an attribute rewrote the prose instead.
      const head = block.slice(tag.attrsStart, existing.start).replace(/\s+$/, '')
      const rest = block.slice(existing.end, tag.attrsEnd)
      // Whitespace that only separates the removed attribute from `>` is kept,
      // so a tag written across several lines keeps its shape.
      const tail = rest.trim() ? rest.replace(/^\s+/, ' ') : rest.replace(/^[^\S\n]+/, '')
      let attrs = head + tail
      if (attrs && !/^\s/.test(attrs))
        attrs = ` ${attrs}`
      // `<Pill />` keeps its space; `<div>` does not grow one.
      if (!attrs && tag.selfClosing)
        attrs = ' '
      return block.slice(0, tag.attrsStart) + attrs + block.slice(tag.attrsEnd)
    }
    return block.slice(0, existing.start) + next + block.slice(existing.end)
  }

  if (!next)
    return block

  // `<Pill>` has no attributes at all, so it still needs a separator before
  // the first one: without it the tag becomes `<Pillv-drag=...>`.
  const before = tag.attrs.length && tag.attrs.endsWith(' ') ? '' : ' '
  // A self-closing tag needs its slash kept off the attribute: `v-click />`.
  const after = tag.selfClosing ? ' ' : ''
  return block.slice(0, tag.attrsEnd) + before + next + after + block.slice(tag.attrsEnd)
}

function renderAttr(name: string, value: string | true, options: WriteAttrOptions) {
  const key = `${options.bound ? ':' : ''}${name}${options.modifiers?.length ? `.${options.modifiers.join('.')}` : ''}`
  return value === true ? key : `${key}="${String(value).replace(/"/g, '&quot;')}"`
}
