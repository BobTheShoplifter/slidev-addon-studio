import { readdir } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import YAML from 'yaml'

/**
 * What Studio knows about a component beyond its name.
 *
 * Three sources, in order of authority:
 *
 * 1. An `@studio` block in the component, which is plain YAML and can describe
 *    anything, including where a prop's options come from.
 * 2. A usage example in the component's own leading doc comment, which most
 *    well-documented components already have and which makes a far better
 *    snippet than one synthesised from prop types.
 * 3. The props themselves, as a last resort.
 */

export interface PropOption {
  value: string
  /** URL of a thumbnail, when the options are backed by image files. */
  preview?: string
}

export interface PropMeta {
  name: string
  type?: string
  required?: boolean
  default?: string
  /** Human label for the inspector; defaults to the prop name. */
  label?: string
  options?: PropOption[]
  /** Write as `:prop="…"` rather than `prop="…"`. */
  bind?: boolean
  /** Keep this prop out of the inspector. */
  hidden?: boolean
}

export interface StudioMeta {
  description?: string
  category?: string
  snippet?: string
  preview?: string | false
  hidden?: boolean
  props?: Record<string, RawPropMeta>
}

interface RawPropMeta {
  label?: string
  hidden?: boolean
  /** A list of values, or a description of where to find them. */
  options?: string[] | { files: string, exclude?: string }
}

const RE_STUDIO_BLOCK = /<!--\s*@studio\s*\n([\s\S]*?)-->/

/**
 * Reads the optional `@studio` block. It is YAML so component authors can
 * describe nested things such as per-prop options without learning a bespoke
 * format:
 *
 * ```html
 * <!-- @studio
 * description: One of the site's mascots
 * props:
 *   name:
 *     label: Mascot
 *     options:
 *       files: ../assets/mascots/*.svg
 *       exclude: '*-stroke.svg'
 * -->
 * ```
 */
export function parseStudioBlock(code: string): StudioMeta {
  const match = code.match(RE_STUDIO_BLOCK)
  if (!match)
    return {}
  try {
    return (YAML.parse(match[1]) ?? {}) as StudioMeta
  }
  catch (error: any) {
    console.warn(`[slidev-studio] Could not read an @studio block: ${error?.message ?? error}`)
    return {}
  }
}

const RE_DOC_COMMENT = /\/\*\*([\s\S]*?)\*\//

/**
 * Pulls the first usage example out of a component's leading doc comment.
 *
 * A component that documents itself as `<BigCount :to="138723" label="Enheter" />`
 * has already said what a good example looks like, with real values. That beats
 * anything derived from prop types, and it makes the palette preview render
 * something meaningful instead of an empty shell.
 */
export function parseUsageExample(code: string, name: string): string | undefined {
  const comment = code.match(RE_DOC_COMMENT)?.[1]
  if (!comment)
    return undefined

  const lines = comment.split('\n').map(line => line.replace(/^\s*\* ?/, ''))
  const open = new RegExp(`^\\s*<${name}[\\s/>]`)

  const start = lines.findIndex(line => open.test(line))
  if (start < 0)
    return undefined

  const collected: string[] = []
  for (let i = start; i < lines.length; i++) {
    collected.push(lines[i])
    const joined = collected.join('\n')
    if (isBalanced(joined, name))
      return dedent(collected).join('\n').trim()
    // A single example should not run away with the whole comment.
    if (collected.length > 12)
      return undefined
  }
  return undefined
}

function isBalanced(text: string, name: string) {
  if (/\/>\s*$/.test(text.trim()))
    return true
  const opens = text.match(new RegExp(`<${name}\\b`, 'g'))?.length ?? 0
  const closes = text.match(new RegExp(`</${name}>`, 'g'))?.length ?? 0
  return opens > 0 && opens === closes
}

function dedent(lines: string[]) {
  const widths = lines.filter(l => l.trim()).map(l => l.match(/^\s*/)![0].length)
  const indent = widths.length ? Math.min(...widths) : 0
  return lines.map(l => l.slice(indent))
}

const IMAGE_EXTENSIONS = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif'])

/**
 * Turns a prop's declared option source into concrete values.
 *
 * `files` globs are resolved against the component's own directory, so a
 * component that ships a folder of assets can offer them as choices without
 * anything being hardcoded in the editor. When those files are images the
 * option carries a thumbnail URL and the inspector shows a picker rather than
 * a dropdown.
 */
export async function resolveOptions(raw: RawPropMeta['options'], componentFile: string): Promise<PropOption[] | undefined> {
  if (!raw)
    return undefined

  if (Array.isArray(raw))
    return raw.map(value => ({ value: String(value) }))

  if (!raw.files)
    return undefined

  const pattern = raw.files
  const base = resolve(dirname(componentFile), dirname(pattern))
  const match = globToRegExp(basenameOf(pattern))
  const skip = raw.exclude ? globToRegExp(raw.exclude) : null

  let entries: string[]
  try {
    entries = (await readdir(base, { withFileTypes: true }))
      .filter(entry => entry.isFile())
      .map(entry => entry.name)
  }
  catch {
    console.warn(`[slidev-studio] Could not read options from "${pattern}" for ${componentFile}`)
    return undefined
  }

  return entries
    .filter(file => match.test(file) && !skip?.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((file) => {
      const ext = extname(file)
      return {
        value: file.slice(0, file.length - ext.length),
        preview: IMAGE_EXTENSIONS.has(ext.toLowerCase()) ? toFsUrl(join(base, file)) : undefined,
      }
    })
}

function basenameOf(pattern: string) {
  return pattern.split('/').pop() ?? pattern
}

function globToRegExp(pattern: string) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`, 'i')
}

/** Vite serves files outside the project root through the `/@fs/` prefix. */
export function toFsUrl(path: string) {
  return `/@fs/${path.replace(/\\/g, '/').replace(/^\//, '')}`
}
