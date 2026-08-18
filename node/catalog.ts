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
])

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
    const { source, origin } = classify(file, options)
    let description: string | undefined
    let props: PropMeta[] = []
    try {
      const code = await readFile(file, 'utf-8')
      const meta = parseStudioBlock(code)
      description = meta.description
      props = await describeProps(code, file, meta)
    }
    catch {}
    layouts.push({ name, file, source, origin, description, props })
  }

  components.sort((a, b) => a.name.localeCompare(b.name))
  layouts.sort((a, b) => a.name.localeCompare(b.name))

  return { components, layouts }
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

  const props = extname(file) === '.vue' ? await describeProps(code, file, meta) : []
  const example = parseUsageExample(code, name)
  const snippet = meta.snippet ?? example ?? defaultSnippet(name, props, /<slot\b/.test(code))

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

/** First prose line of the component's doc comment, if it reads like a summary. */
function describeFromDoc(code: string): string | undefined {
  const comment = code.match(/\/\*\*([\s\S]*?)\*\//)?.[1]
  if (!comment)
    return undefined
  for (const raw of comment.split('\n')) {
    const line = raw.replace(/^\s*\* ?/, '').trim()
    if (!line || line.startsWith('<') || line.startsWith('@'))
      continue
    // `Name — what it does` and `Name - what it does` both read as a summary.
    const summary = line.replace(/^\w+\s*[-–—:]\s*/, '')
    return summary.length > 120 ? `${summary.slice(0, 117)}…` : summary
  }
  return undefined
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
    return parseTypeProps(typeMatch[1], RE_WITH_DEFAULTS.test(code) ? parseDefaults(code) : {})

  const objectMatch = code.match(RE_DEFINE_PROPS_OBJECT)
  if (objectMatch)
    return parseObjectProps(objectMatch[1])

  const optionsMatch = code.match(RE_OPTIONS_PROPS)
  if (optionsMatch)
    return parseObjectProps(optionsMatch[1])

  return []
}

function parseTypeProps(body: string, defaults: Record<string, string>): PropMeta[] {
  const props: PropMeta[] = []
  // Strip nested object/function types so a naive split stays honest.
  const flat = body.replace(/\{[^{}]*\}/g, '{…}')
  for (const line of flat.split(/[\n;,]/)) {
    const match = line.match(/^\s*(\w+)(\?)?\s*:\s*(.+?)\s*$/)
    if (!match)
      continue
    const [, name, optional, type] = match
    props.push({
      name,
      type: type.trim(),
      required: !optional,
      default: defaults[name],
      options: parseStringUnion(type),
    })
  }
  return props
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
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^\s*(\w+)\s*:\s*(.+?),?\s*$/)
    if (kv)
      defaults[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '')
  }
  return defaults
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
    props.push({
      name,
      type: block.match(/type\s*:\s*(\w+)/)?.[1]?.toLowerCase(),
      required: /required\s*:\s*true/.test(block),
      default: block.match(/default\s*:\s*(.+?),?\s*$/m)?.[1]?.replace(/^['"]|['"]$/g, ''),
    })
  }
  return props
}

/**
 * The markup inserted when a component documents no example of its own.
 * Required props are stubbed with a value of the right shape, since an empty
 * string satisfies the syntax but fails Vue's prop validation.
 */
function defaultSnippet(name: string, props: PropMeta[], hasSlot: boolean): string {
  const required = props.filter(p => p.required && p.name !== 'modelValue').slice(0, 3)
  const attrs = required.map(stubAttr).join('')
  return hasSlot ? `<${name}${attrs}>Text</${name}>` : `<${name}${attrs} />`
}

function stubAttr(prop: PropMeta): string {
  if (prop.options?.length)
    return ` ${prop.name}="${prop.options[0].value}"`
  if (prop.default)
    return ` ${prop.name}="${prop.default}"`

  const type = (prop.type ?? 'string').toLowerCase()
  if (type.includes('[]') || type.startsWith('array'))
    return ` :${prop.name}="[]"`
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
