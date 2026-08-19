import type { ResolvedSlidevOptions } from '@slidev/types'
import type { PropMeta, PropOption } from './metadata'
import { readdir, readFile } from 'node:fs/promises'
import { basename, extname, join, relative, resolve, sep } from 'node:path'
import { parseStudioBlock, parseUsageExample, resolveOptions } from './metadata'

export type { PropControl, PropMeta, PropOption } from './metadata'

export type ComponentSource = 'builtin' | 'theme' | 'addon' | 'project'

export interface ComponentEntry {
  name: string
  file: string
  source: ComponentSource
  /** Directory or package the component came from, used to group the palette. */
  origin: string
  description?: string
  category?: string
  /** Markup inserted into the slide when the component is picked. */
  snippet: string
  /** Markup rendered in the palette thumbnail. Empty when it cannot be shown. */
  preview: string
  props: PropMeta[]
  previewable: boolean
}

export interface LayoutEntry {
  name: string
  file: string
  source: ComponentSource
  origin: string
  description?: string
  /**
   * A layout's props are supplied by the slide's frontmatter, so these are the
   * frontmatter keys that layout understands. For a slide like `layout: fact`,
   * whose whole text lives in `value` and `label`, this is the only way to edit
   * it: nothing on screen came through Markdown.
   */
  props: PropMeta[]
}

export interface Catalog {
  components: ComponentEntry[]
  layouts: LayoutEntry[]
}

const COMPONENT_EXTENSIONS = new Set(['.vue', '.ts', '.js', '.tsx', '.jsx'])

/**
 * Components that exist for Slidev's own plumbing and would only be noise in a
 * palette, or that cannot render outside a real slide.
 */
const HIDDEN_BUILTINS = new Set([
  'VClick',
  'VClicks',
  'VAfter',
  'VClickGap',
  'VSwitch',
  'VDrag',
  'VDragArrow',
  'RenderWhen',
  'LightOrDark',
  'CodeBlockWrapper',
  'KaTexBlockWrapper',
  'CodeGroup',
  'ShikiMagicMove',
  'SlideCurrentNo',
  'SlidesTotal',
  'PoweredBySlidev',
  'TocList',
  'katex-lines',
  // Slidev emits these from a fenced code block and says so in their own
  // headers. A bare tag either crashes, `<Monaco />` decompresses an empty
  // payload and throws, or renders an error box from a stub payload.
  'Monaco',
  'Mermaid',
  'PlantUml',
])

/**
 * Layouts that exist for Slidev's own error states. Neither renders a slot, so
 * choosing one silently discards everything on the slide.
 */
const HIDDEN_LAYOUTS = new Set(['404', 'error'])

/**
 * Snippets for components whose real usage cannot be derived from their props.
 * SlidevVideo takes its media from slot content, so every generated form of it
 * is an empty player.
 */
const BUILTIN_SNIPPETS: Record<string, string> = {
  // The source is bound rather than written as a plain attribute on purpose.
  // Vue turns `src` on a real HTML element into an asset import, so a file the
  // author has not added yet would fail the build instead of simply showing a
  // missing video. Bound, it stays a runtime URL.
  SlidevVideo: '<SlidevVideo autoplay controls>\n  <source :src="\'/video.mp4\'" type="video/mp4" />\n</SlidevVideo>',
}

/** Components that reach for the network or a heavy runtime in a 200px box. */
const NO_PREVIEW = new Set(['Monaco', 'Mermaid', 'PlantUml', 'Tweet', 'Youtube', 'BlueSky', 'SlidevVideo', 'Toc'])

export async function buildCatalog(options: ResolvedSlidevOptions): Promise<Catalog> {
  const { clientRoot, userRoot, themeRoots, addonRoots, utils } = options
  const hidden = new Set<string>(((options.data.config as any).studio?.hideComponents ?? []) as string[])

  const dirs: { dir: string, source: ComponentSource, origin: string }[] = [
    { dir: join(clientRoot, 'builtin'), source: 'builtin', origin: 'Slidev' },
    ...themeRoots.map(root => ({ dir: join(root, 'components'), source: 'theme' as const, origin: originOf(root) })),
    ...addonRoots.map(root => ({ dir: join(root, 'components'), source: 'addon' as const, origin: originOf(root) })),
    { dir: join(userRoot, 'components'), source: 'project', origin: 'Project' },
  ]

  const components: ComponentEntry[] = []
  const seen = new Set<string>()

  for (const { dir, source, origin } of dirs) {
    for (const file of await listFiles(dir)) {
      const ext = extname(file)
      if (!COMPONENT_EXTENSIONS.has(ext))
        continue

      const name = basename(file, ext)
      if (name.startsWith('_') || name.startsWith('.') || name.endsWith('.test'))
        continue
      if (source === 'builtin' && HIDDEN_BUILTINS.has(name))
        continue
      if (hidden.has(name))
        continue

      // Later roots win, matching how unplugin-vue-components resolves names.
      if (seen.has(name)) {
        const previous = components.findIndex(c => c.name === name)
        if (previous >= 0)
          components.splice(previous, 1)
      }
      seen.add(name)

      const entry = await readComponent(file, name, source, origin)
      if (entry)
        components.push(entry)
    }
  }

  const layouts: LayoutEntry[] = []
  const layoutPaths = await utils.getLayouts()
  for (const [name, file] of Object.entries(layoutPaths)) {
    if (HIDDEN_LAYOUTS.has(name))
      continue
    const { source, origin } = classify(file, options)
    let description: string | undefined
    let props: PropMeta[] = []
    try {
      const code = await readFile(file, 'utf-8')
      const meta = parseStudioBlock(code)
      description = meta.description ?? describeFromDoc(code)
      props = await describeProps(code, file, meta)
    }
    catch {}
    layouts.push({ name, file, source, origin, description, props })
  }

  // Documentation examples reference stand-ins that are not real components,
  // such as Transform's `<YourElements />`. Inserting one warns at runtime and
  // renders nothing, so it becomes plain text the author can replace.
  const known = new Set(components.map(c => c.name))
  for (const component of components) {
    component.snippet = replaceUnknownTags(component.snippet, known, component.name)
    component.preview = replaceUnknownTags(component.preview, known, component.name)
  }

  components.sort((a, b) => a.name.localeCompare(b.name))
  layouts.sort((a, b) => a.name.localeCompare(b.name))

  return { components, layouts }
}

const RE_ANY_TAG = /<\/?([A-Za-z][\w.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)\/?>/g

function replaceUnknownTags(markup: string, known: Set<string>, self: string): string {
  return markup.replace(RE_ANY_TAG, (full, tag: string) => {
    // Lowercase tags are HTML, and a component that exists is fine as it is.
    if (!/^[A-Z]/.test(tag) || tag === self || known.has(tag))
      return full
    if (full.startsWith('</'))
      return ''
    // `<YourElements />` reads as "Your elements", which is what the doc meant.
    const words = tag.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
    return words.charAt(0).toUpperCase() + words.slice(1)
  })
}

function originOf(root: string) {
  const parts = root.split(sep).filter(Boolean)
  const idx = parts.lastIndexOf('node_modules')
  if (idx >= 0) {
    const rest = parts.slice(idx + 1)
    return rest[0]?.startsWith('@') ? rest.slice(0, 2).join('/') : rest[0] ?? root
  }
  return parts[parts.length - 1] ?? root
}

function classify(file: string, options: ResolvedSlidevOptions): { source: ComponentSource, origin: string } {
  const inside = (root: string) => !relative(root, file).startsWith('..')
  for (const root of options.themeRoots) {
    if (inside(root))
      return { source: 'theme', origin: originOf(root) }
  }
  for (const root of options.addonRoots) {
    if (inside(root))
      return { source: 'addon', origin: originOf(root) }
  }
  if (inside(options.clientRoot))
    return { source: 'builtin', origin: 'Slidev' }
  return { source: 'project', origin: 'Project' }
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true, recursive: true })
    return entries
      .filter(e => e.isFile())
      .map(e => resolve(e.parentPath ?? dir, e.name))
  }
  catch {
    return []
  }
}

async function readComponent(file: string, name: string, source: ComponentSource, origin: string): Promise<ComponentEntry | null> {
  let code = ''
  try {
    code = await readFile(file, 'utf-8')
  }
  catch {
    return null
  }

  const meta = parseStudioBlock(code)
  if (meta.hidden)
    return null

  // Vue drops fallthrough attributes on a component with several root nodes, so
  // such a component never receives its source annotation and is invisible to
  // the editor however it is inserted. Offering it would only mislead.
  if (extname(file) === '.vue' && !hasSingleRoot(code))
    return null

  const props = extname(file) === '.vue' ? await describeProps(code, file, meta) : []
  const example = parseUsageExample(code, name)
  const snippet = meta.snippet ?? BUILTIN_SNIPPETS[name] ?? example ?? defaultSnippet(name, props, code)

  // Only render a preview we can trust. A component with required props and no
  // example would be handed empty stand-ins, which is how a palette ends up
  // filling the console with prop validation warnings.
  const requiresProps = props.some(p => p.required)
  const preview = meta.preview === false
    ? ''
    : typeof meta.preview === 'string'
      ? meta.preview
      : requiresProps
        ? (meta.snippet ?? example ?? '')
        : snippet

  return {
    name,
    file,
    source,
    origin,
    description: meta.description ?? describeFromDoc(code),
    category: meta.category,
    snippet,
    preview,
    props,
    previewable: extname(file) === '.vue' && !NO_PREVIEW.has(name) && !!preview,
  }
}

/**
 * Counts the root nodes of an SFC template.
 *
 * Conservative on purpose: anything it cannot read confidently is treated as a
 * single root, so a parsing gap hides nothing that works.
 */
export function hasSingleRoot(code: string): boolean {
  const template = code.match(/<template>([\s\S]*?)<\/template>\s*(?:<script|<style|$)/)?.[1]
  if (!template)
    return true

  let depth = 0
  let roots = 0
  let sawBranch = false

  const tags = template.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([A-Za-z][\w.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g)
  for (const [, closing, , attrs, selfClose] of tags) {
    if (closing) {
      depth -= 1
      continue
    }
    if (depth === 0) {
      // `v-else` continues the previous root rather than adding one.
      if (/\sv-else\b|\sv-else-if[=\s]/.test(attrs))
        sawBranch = true
      else
        roots += 1
    }
    if (!selfClose)
      depth += 1
  }

  return roots <= 1 || (sawBranch && roots <= 2)
}

/** Opening prose of the component's doc comment, if it reads like a summary. */
function describeFromDoc(code: string): string | undefined {
  // Only the part before the template: a `/* … */` inside <style> is CSS, and
  // taking it made Monaco's description read "Revert styles".
  const head = code.split(/<template[\s>]/)[0]
  const comment = head.match(/\/\*\*([\s\S]*?)\*\//)?.[1] ?? head.match(/<!--(?!\s*@studio)([\s\S]*?)-->/)?.[1]
  if (!comment)
    return undefined

  const prose: string[] = []
  for (const raw of comment.split('\n')) {
    const line = raw.replace(/^\s*\* ?/, '').trim()
    if (!line || line.startsWith('<') || line.startsWith('@')) {
      if (prose.length)
        break
      continue
    }
    prose.push(line)
    if (/[.!?]$/.test(line))
      break
  }

  if (!prose.length)
    return undefined

  // `Name — what it does` and `Name - what it does` both read as a summary.
  const summary = prose.join(' ').replace(/^\w+\s*[-–—:]\s*/, '')
  if (summary.length <= 120)
    return summary
  const cut = summary.slice(0, 117)
  return `${cut.slice(0, cut.lastIndexOf(' ') + 1 || cut.length).trim()}…`
}

async function describeProps(code: string, file: string, meta: ReturnType<typeof parseStudioBlock>): Promise<PropMeta[]> {
  const props = parseProps(code)

  for (const prop of props) {
    const declared = meta.props?.[prop.name]
    if (!declared)
      continue
    prop.label = declared.label
    prop.hidden = declared.hidden
    prop.control = declared.control
    const options = await resolveOptions(declared.options, file)
    if (options)
      prop.options = options
  }

  // Props the author described but the parser did not find still belong in the
  // inspector: an author who bothered to document one means it to be editable.
  for (const [name, declared] of Object.entries(meta.props ?? {})) {
    if (props.some(p => p.name === name))
      continue
    props.push({
      name,
      label: declared.label,
      hidden: declared.hidden,
      control: declared.control,
      options: await resolveOptions(declared.options, file),
    })
  }

  return props.filter(p => !p.hidden)
}

const RE_DEFINE_PROPS_TYPE = /defineProps\s*<\s*\{([\s\S]*?)\}\s*>\s*\(/
const RE_DEFINE_PROPS_OBJECT = /defineProps\s*\(\s*\{([\s\S]*?)^\s*\}\s*\)/m
const RE_OPTIONS_PROPS = /\bprops\s*:\s*\{([\s\S]*?)^(\s*)\}\s*,?\s*$/m
const RE_WITH_DEFAULTS = /withDefaults\s*\(\s*defineProps/

/**
 * Best-effort prop extraction so the inspector can offer real controls.
 * It understands the shapes that cover almost every SFC in the wild; anything
 * more exotic simply yields no props and the component still works.
 */
export function parseProps(code: string): PropMeta[] {
  const typeMatch = code.match(RE_DEFINE_PROPS_TYPE)
  if (typeMatch)
    return parseTypeProps(typeMatch[1], RE_WITH_DEFAULTS.test(code) ? parseDefaults(code) : {}, code)

  const objectMatch = code.match(RE_DEFINE_PROPS_OBJECT)
  if (objectMatch)
    return parseObjectProps(objectMatch[1])

  const optionsMatch = code.match(RE_OPTIONS_PROPS)
  if (optionsMatch)
    return parseObjectProps(optionsMatch[1])

  return []
}

function parseTypeProps(body: string, defaults: Record<string, string>, code = ''): PropMeta[] {
  const props: PropMeta[] = []
  // Comments first: a trailing `// values: 'a', 'b'` was being read as part of
  // the type, and then shown to the user as the field's placeholder.
  const cleaned = body.replace(/\/\/[^\n]*/g, '')
  // Nested object types collapse so they cannot be mistaken for structure, but
  // the split itself respects brackets, so `Record<string, unknown>` survives.
  const flat = cleaned.replace(/\{[^{}]*\}/g, '{…}')

  for (const entry of splitTopLevel(flat.replace(/[\n;]/g, ','))) {
    const match = entry.match(/^\s*(\w+)(\?)?\s*:\s*([\s\S]+?)\s*$/)
    if (!match)
      continue
    const [, name, optional, rawType] = match
    const type = rawType.trim()
    props.push({
      name,
      type,
      required: !optional,
      default: defaults[name],
      options: parseStringUnion(type) ?? parseStringUnion(resolveAlias(type, code)),
    })
  }
  return props
}

/**
 * Follows a type alias declared in the same file.
 *
 * `type Level = 'red' | 'amber'` then `level?: Level` is common, and without
 * this the inspector offers a free text box where it could offer the five
 * actual choices.
 */
function resolveAlias(type: string, code: string): string {
  if (!/^\w+$/.test(type))
    return type
  return code.match(new RegExp(`type\\s+${type}\\s*=\\s*([^;\n]+)`))?.[1]?.trim() ?? type
}

function parseStringUnion(type: string): PropOption[] | undefined {
  const parts = type.split('|').map(p => p.trim())
  if (parts.length < 2 || !parts.every(p => /^'[^']*'$|^"[^"]*"$/.test(p)))
    return undefined
  return parts.map(p => ({ value: p.slice(1, -1) }))
}

function parseDefaults(code: string): Record<string, string> {
  const match = code.match(/withDefaults\s*\([\s\S]*?,\s*\{([\s\S]*?)\}\s*,?\s*\)/)
  if (!match)
    return {}

  const defaults: Record<string, string> = {}
  for (const entry of splitTopLevel(match[1])) {
    const kv = entry.match(/^\s*(\w+)\s*:\s*([\s\S]+?)\s*$/)
    if (kv)
      defaults[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '')
  }
  return defaults
}

/**
 * Splits an object body on its own commas.
 *
 * Reading defaults line by line was wrong: `{ label: 'Enheter', lead: 'Nå har
 * jeg kontrollen over' }` is one line, and the label's default came out as
 * everything after it.
 */
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

function parseObjectProps(body: string): PropMeta[] {
  const props: PropMeta[] = []
  const re = /(\w+)\s*:\s*(?:\{([\s\S]*?)\}|(\w+))\s*,?/g
  for (const match of body.matchAll(re)) {
    const [, name, block, shorthand] = match
    if (shorthand) {
      props.push({ name, type: shorthand.toLowerCase() })
      continue
    }
    const declared = block.match(/type\s*:\s*(\w+)/)?.[1]?.toLowerCase()
    const fallback = block.match(/default\s*:\s*(.+?),?\s*$/m)?.[1]?.trim()
    props.push({
      name,
      // Without a declared type a numeric prop would be written unbound, as a
      // string, so the default's own shape stands in for it.
      type: declared ?? inferType(fallback),
      required: /required\s*:\s*true/.test(block),
      default: fallback?.replace(/^['"]|['"]$/g, ''),
    })
  }
  return props
}

/**
 * One plausible entry for a required array prop, built from the element type
 * the component declares so the shape is right rather than merely non-empty.
 */
function sampleItem(prop: PropMeta, code: string): string {
  const element = (prop.type ?? '').replace(/\[\]$/, '').trim()

  // `{ src: string, caption?: string }` was collapsed to `{…}` by the parser,
  // so read the keys from the source instead.
  const shape = code.match(new RegExp(`${prop.name}\\??\\s*:\\s*\\{([^}]*)\\}\\[\\]`))?.[1]
    ?? (/^[A-Z]/.test(element) ? code.match(new RegExp(`(?:interface|type)\\s+${element}\\s*=?\\s*\\{([^}]*)\\}`))?.[1] : undefined)

  if (!shape)
    return `'text'`

  const keys = [...shape.matchAll(/(\w+)\??\s*:\s*([\w'|\s]+)/g)].slice(0, 3)
  if (!keys.length)
    return `'text'`

  const entries = keys.map(([, key, type]) => `${key}: ${/number/.test(type) ? '1' : `'text'`}`)
  return `{ ${entries.join(', ')} }`
}

function inferType(value: string | undefined): string | undefined {
  if (!value)
    return undefined
  if (/^-?\d+(?:\.\d+)?$/.test(value))
    return 'number'
  if (value === 'true' || value === 'false')
    return 'boolean'
  if (value.startsWith('[') || value.startsWith('() => ['))
    return 'array'
  if (/^['"`]/.test(value))
    return 'string'
  return undefined
}

/**
 * The markup inserted when a component documents no example of its own.
 * Required props are stubbed with a value of the right shape, since an empty
 * string satisfies the syntax but fails Vue's prop validation.
 */
function defaultSnippet(name: string, props: PropMeta[], code: string): string {
  const required = props.filter(p => p.required && p.name !== 'modelValue').slice(0, 3)
  const attrs = required.map(prop => stubAttr(prop, code)).join('')

  // An unnamed slot takes children. A component with only named slots does not,
  // and writing children into one throws them away silently, which is what
  // happened to QuizCard's text.
  if (/<slot(?![^>]*\bname=)/.test(code))
    return `<${name}${attrs}>Text</${name}>`

  const named = [...code.matchAll(/<slot[^>]*\bname="([\w-]+)"/g)].map(m => m[1]).slice(0, 2)
  if (named.length) {
    const slots = named.map(slot => `  <template #${slot}>Text</template>`).join('\n')
    return `<${name}${attrs}>\n${slots}\n</${name}>`
  }

  return `<${name}${attrs} />`
}

function stubAttr(prop: PropMeta, code = ''): string {
  if (prop.options?.length)
    return ` ${prop.name}="${prop.options[0].value}"`
  if (prop.default)
    return ` ${prop.name}="${prop.default}"`

  const type = (prop.type ?? 'string').toLowerCase()
  if (type.includes('[]') || type.startsWith('array'))
    // An empty array renders nothing, and a component that renders nothing
    // cannot be clicked, so a required list gets one representative row.
    return ` :${prop.name}="[${sampleItem(prop, code)}]"`
  if (type.startsWith('{') || type.startsWith('object') || type.startsWith('record'))
    return ` :${prop.name}="{}"`
  if (type.includes('number'))
    return ` :${prop.name}="0"`
  if (type.includes('boolean'))
    return ` ${prop.name}`
  if (type.includes('function') || type.includes('=>'))
    return ''
  return ` ${prop.name}="${prop.name}"`
}
