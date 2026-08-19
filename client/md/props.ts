import type { PropMeta, SourceRange } from '../types'
import { getBlock, replaceBlock } from './lines'
import { findAttr, opensWithTag, writeAttr } from './tags'

/**
 * Reading and writing a component's props from the inspector.
 *
 * Vue has two spellings for the same prop: `label="Enheter"` passes a string,
 * `:to="138723"` passes an expression. Which one is correct depends on the
 * prop's type, so the editor picks for the author rather than making them
 * remember the colon.
 */

export function readProp(content: string, range: SourceRange, prop: PropMeta): string | boolean | null {
  const block = getBlock(content, range)
  if (!opensWithTag(block))
    return null

  const attr = findAttr(block, prop.name)
  if (!attr)
    return null

  // A bare attribute on a boolean prop means `true`.
  if (attr.value === null)
    return isBoolean(prop) ? true : ''

  // A prop that is a boolean *and* something else, such as `boolean | 'once'`,
  // keeps its written value: the inspector shows it as one option among the
  // others rather than collapsing it to yes or no.
  if (isBoolean(prop) && !prop.options?.length)
    return attr.value !== 'false'

  return attr.value
}

export function writeProp(content: string, range: SourceRange, prop: PropMeta, value: string | boolean | null): string {
  const block = getBlock(content, range)
  if (!opensWithTag(block))
    return content

  // Removing the attribute means "use the component's default". For a prop that
  // defaults to true, that is the opposite of what "No" asked for, so the false
  // has to be written out.
  if (value === false && isTruthyDefault(prop))
    return replaceBlock(content, range, writeAttr(block, prop.name, 'false', { bound: true }))

  // Clearing a required prop would leave markup the component warns about, so
  // an empty value keeps whatever was there.
  if ((value === null || value === '') && prop.required)
    return content

  if (value === null || value === '' || value === false)
    return replaceBlock(content, range, writeAttr(block, prop.name, null))

  if (value === true)
    return replaceBlock(content, range, writeAttr(block, prop.name, true))

  return replaceBlock(content, range, writeAttr(block, prop.name, value, { bound: needsBinding(prop, value) }))
}

/** A boolean prop the component turns on unless told otherwise. */
export function isTruthyDefault(prop: PropMeta) {
  return isBoolean(prop) && (prop.default === 'true' || prop.default === true as any)
}

export function isBoolean(prop: PropMeta) {
  const type = (prop.type ?? '').toLowerCase()
  return type.includes('boolean') && !type.includes('string')
}

export function isNumber(prop: PropMeta) {
  const type = (prop.type ?? '').toLowerCase()
  return type.includes('number') && !type.includes('string')
}

/**
 * Numbers, arrays and objects have to be bound or Vue hands the component a
 * string. Enumerated string props never are, so a `color` stays readable in the
 * Markdown as `color="red"`.
 */
function needsBinding(prop: PropMeta, value: string) {
  if (prop.options?.length) {
    // An enumerated prop can still mix types. SlidevVideo's `autoplay` is
    // `boolean | 'once'`, and `autoplay="true"` hands it the string "true",
    // which is neither `true` nor `'once'`, so autoplay never fired.
    const text = value.trim()
    const declared = (prop.type ?? '').toLowerCase()
    if ((text === 'true' || text === 'false') && declared.includes('boolean'))
      return true
    if (/^-?\d+(?:\.\d+)?$/.test(text) && declared.includes('number'))
      return true
    return false
  }
  if (isNumber(prop))
    return true
  const type = (prop.type ?? '').toLowerCase()
  // `number | string` takes either, so bind only when the value is a number.
  if (type.includes('number') && /^-?\d+(?:\.\d+)?$/.test(value.trim()))
    return true
  if (type.includes('[]') || type.startsWith('array') || type.startsWith('{') || type.startsWith('object') || type.startsWith('record'))
    return true
  // An author who typed a literal expression means it as one.
  return /^[[{]/.test(value.trim())
}
