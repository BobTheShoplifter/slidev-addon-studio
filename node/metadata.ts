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

/**
 * The control the inspector should use.
 *
 * Most are inferred from the prop's type. `color` and `color[]` are not, since
 * nothing in `string` says the string is a colour, so an author declares those.
 */
export type PropControl = 'text' | 'number' | 'boolean' | 'select' | 'list' | 'color' | 'color[]' | 'object[]'

export interface PropField {
  name: string
  type?: string
}

export interface PropMeta {
  name: string
  type?: string
  /** For an array of records, the fields each row holds. */
  fields?: PropField[]
  required?: boolean
  default?: string
  /** Human label for the inspector; defaults to the prop name. */
  label?: string
  control?: PropControl
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
  control?: PropControl
  /** A list of values, or a description of where to find them. */
  options?: string[] | { files: string, exclude?: string }
  /**
   * For a list of records, the fields each row holds. Only needed when the
   * element type is opaque, such as `items: any[]`: a declared shape like
   * `{ year: string }[]` is read straight from the component.
   */
  fields?: (string | { name: string, type?: string })[]
}

/**
 * The preferred form: a custom SFC block, which Vue's tooling understands and
 * ignores. An HTML comment before the `<script>` block makes some editors treat
 * the whole file as a template and lose syntax highlighting, so that form is
 * still read but no longer the one to recommend.
 */
const RE_STUDIO_SFC_BLOCK = /<studio\b[^>]*>([\s\S]*?)<\/studio>/
const RE_STUDIO_COMMENT_BLOCK = /<!--\s*@studio\s*\n([\s\S]*?)-->/

/**
 * Reads the optional Studio block. It is YAML so component authors can describe
 * nested things such as per-prop options without learning a bespoke format:
 *
 * ```html
 * <studio lang="yaml">
 * description: One of the site's mascots
 * props:
 *   name:
 *     label: Mascot
 *     options:
 *       files: ../assets/mascots/*.svg
 *       exclude: '*-stroke.svg'
 * </studio>
 * ```
 */
export function parseStudioBlock(code: string): StudioMeta {
  const match = code.match(RE_STUDIO_SFC_BLOCK) ?? code.match(RE_STUDIO_COMMENT_BLOCK)
  if (!match)
    return {}
  try {
    return (YAML.parse(match[1]) ?? {}) as StudioMeta
  }
  catch (error: any) {
    console.warn(`[slidev-studio] Could not read a <studio> block: ${error?.message ?? error}`)
    return {}
  }
}

const RE_DOC_COMMENT = /\/\*\*([\s\S]*?)\*\//
/** Slidev's own builtins document themselves in a leading HTML comment. */
const RE_HTML_COMMENT = /<!--(?!\s*@studio)([\s\S]*?)-->/

/**
 * Pulls the first usage example out of a component's leading doc comment.
 *
 * A component that documents itself as `<BigCount :to="138723" label="Enheter" />`
 * has already said what a good example looks like, with real values. That beats
 * anything derived from prop types, and it makes the palette preview render
 * something meaningful instead of an empty shell.
 */
export function parseUsageExample(code: string, name: string): string | undefined {
  for (const comment of [code.match(RE_DOC_COMMENT)?.[1], code.match(RE_HTML_COMMENT)?.[1]]) {
    const example = exampleFrom(comment, name)
    if (example)
      return example
  }
  return undefined
}

function exampleFrom(comment: string | undefined, name: string): string | undefined {
  if (!comment)
    return undefined

  const lines = comment.split('\n').map(line => line.replace(/^\s*\* ?/, ''))
  // Slidev's own docs write `<arrow …>` for `Arrow`, so match loosely and emit
  // the canonical name.
  const open = new RegExp(`^\\s*<${name}[\\s/>]`, 'i')

  const start = lines.findIndex(line => open.test(line))
  if (start < 0)
    return undefined

  const collected: string[] = []
  for (let i = start; i < lines.length; i++) {
    collected.push(lines[i])
    const joined = trimToTag(collected.join('\n'), name)
    if (isBalanced(joined, name)) {
      const example = canonicalise(trimToTag(dedent(collected).join('\n').trim(), name), name)
      // Docs abbreviate: `:items="[{ … }, …]"` shows the shape without being
      // valid JavaScript. Inserting that breaks the slide it lands on, with a
      // 500 from the compiler, so an abbreviated example is no example at all.
      return isCompilable(example) ? example : undefined
    }
    // A single example should not run away with the whole comment.
    if (collected.length > 12)
      return undefined
  }
  return undefined
}

/**
 * Whether the collected lines are a complete example.
 *
 * The self-closing test has to look at the example's own outer tag. Testing for
 * a trailing `/>` anywhere stopped Transform's example at its first child,
 * `<YourElements />`, and inserted an unclosed `<Transform>` that broke the
 * slide it landed on.
 */
/**
 * Cuts an example off at the end of its own markup.
 *
 * Doc comments annotate their examples: TlpBadge's reads
 * `<TlpBadge /> → TLP:AMBER (default)`, and taking the whole line dropped that
 * prose onto the slide as visible text.
 */
function trimToTag(text: string, name: string): string {
  const selfClosing = text.match(new RegExp(`^\\s*<${name}\\b(?:"[^"]*"|'[^']*'|[^>"'])*?/>`, 'i'))
  if (selfClosing)
    return selfClosing[0].trim()

  const closing = text.search(new RegExp(`</${name}>`, 'i'))
  return closing === -1 ? text : text.slice(0, closing + name.length + 3)
}

function isBalanced(text: string, name: string) {
  const outer = text.trim().match(new RegExp(`^<${name}\\b((?:"[^"]*"|'[^']*'|[^>"'])*?)(/?)>`, 'i'))
  if (!outer)
    return false
  if (outer[2] === '/')
    return true

  const opens = text.match(new RegExp(`<${name}\\b`, 'gi'))?.length ?? 0
  const closes = text.match(new RegExp(`</${name}>`, 'gi'))?.length ?? 0
  return opens > 0 && opens === closes
}

/**
 * Whether every binding in the example could actually be compiled.
 *
 * String literals are removed first, since an ellipsis inside one is ordinary
 * text: `caption: '1 · …'` is fine, `[{ … }, …]` is not. Only single quotes and
 * backticks are treated as literals, because in a template the double quotes
 * delimit the attribute and the expression lives inside them.
 */
export function isCompilable(example: string): boolean {
  const withoutStrings = example
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')

  if (/[…]/.test(withoutStrings))
    return false
  // A bare `...` only makes sense as a spread, which is always followed by a
  // name, an object or an array.
  return !/\.\.\.\s*[,\]}]/.test(withoutStrings)
}

function canonicalise(example: string, name: string) {
  return example
    .replace(new RegExp(`<${name}\\b`, 'gi'), `<${name}`)
    .replace(new RegExp(`</${name}>`, 'gi'), `</${name}>`)
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
