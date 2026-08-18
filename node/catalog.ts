import type { ResolvedSlidevOptions } from '@slidev/types'
import { readdir, readFile } from 'node:fs/promises'
import { basename, extname, join, relative, resolve, sep } from 'node:path'

export type ComponentSource = 'builtin' | 'theme' | 'addon' | 'project'

export interface PropMeta {
  name: string
  type?: string
  required?: boolean
  default?: string
  /** Enum values parsed from a union of string literals, for a select input. */
  options?: string[]
}

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
  /** Markup rendered in the palette thumbnail; falls back to the snippet. */
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

/** Components that render nothing useful in a 200px preview box. */
const NO_PREVIEW = new Set(['Monaco', 'Mermaid', 'PlantUml', 'Tweet', 'Youtube', 'BlueSky', 'SlidevVideo', 'Toc', 'Arrow', 'Transform'])

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
    const meta = await readDocBlock(file)
    layouts.push({ name, file, source, origin, description: meta.description })
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

  const meta = parseDocBlock(code)
  if (meta.studio === 'false' || meta.hidden === 'true')
    return null

  const props = extname(file) === '.vue' ? parseProps(code) : []
  const snippet = meta.snippet ?? defaultSnippet(name, props, /<slot\b/.test(code))

  return {
    name,
    file,
    source,
    origin,
    description: meta.description,
    category: meta.category,
    snippet,
    preview: meta.preview ?? snippet,
    props,
    previewable: extname(file) === '.vue' && !NO_PREVIEW.has(name) && meta.preview !== 'false',
  }
}

async function readDocBlock(file: string) {
  try {
    return parseDocBlock(await readFile(file, 'utf-8'))
  }
  catch {
    return {}
  }
}

/**
 * Reads an optional metadata block a component author can put at the top of
 * their SFC to control how it appears in the palette:
 *
 * ```html
 * <!-- @studio
 * description: A rounded label
 * category: Content
 * snippet: |
 *   <Pill color="red">Label</Pill>
 * -->
 * ```
 */
export function parseDocBlock(code: string): Record<string, string> {
  const match = code.match(/<!--\s*@studio\s*\n([\s\S]*?)-->/)
  if (!match)
    return {}

  const meta: Record<string, string> = {}
  const lines = match[1].split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const kv = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/)
    if (!kv)
      continue
    const [, key, rawValue] = kv

    if (rawValue.trim() === '|') {
      const block: string[] = []
      let indent: number | null = null
      for (i += 1; i < lines.length; i++) {
        if (!lines[i].trim() && block.length === 0)
          continue
        const current = lines[i].match(/^(\s*)/)![1].length
        if (lines[i].trim() && (indent === null ? false : current < indent))
          break
        if (lines[i].trim() && indent === null)
          indent = current
        block.push(lines[i].slice(indent ?? 0))
      }
      i -= 1
      meta[key] = block.join('\n').replace(/\s+$/, '')
    }
    else {
      meta[key] = rawValue.trim()
    }
  }

  return meta
}

const RE_DEFINE_PROPS_TYPE = /defineProps\s*<\s*\{([\s\S]*?)\}\s*>\s*\(/
const RE_DEFINE_PROPS_OBJECT = /defineProps\s*\(\s*\{([\s\S]*?)^\s*\}\s*\)/m
const RE_OPTIONS_PROPS = /\bprops\s*:\s*\{([\s\S]*?)^(\s*)\}\s*,?\s*$/m
const RE_WITH_DEFAULTS = /withDefaults\s*\(\s*defineProps/

/**
 * Best-effort prop extraction so the inspector can offer real controls.
 * It understands the two shapes that cover almost every SFC in the wild;
 * anything more exotic simply yields no props and the component still works.
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
  // Strip nested object/function types so a naive line split stays honest.
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

function parseStringUnion(type: string): string[] | undefined {
  const parts = type.split('|').map(p => p.trim())
  if (parts.length < 2 || !parts.every(p => /^'[^']*'$|^"[^"]*"$/.test(p)))
    return undefined
  return parts.map(p => p.slice(1, -1))
}

function parseDefaults(code: string): Record<string, string> {
  const match = code.match(/withDefaults\s*\([\s\S]*?,\s*\{([\s\S]*?)\}\s*\)/)
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
 * The markup inserted when a component is picked from the palette. Required
 * props are stubbed so the result renders rather than erroring, and only
 * components that actually render a slot are given children.
 */
function defaultSnippet(name: string, props: PropMeta[], hasSlot: boolean): string {
  const required = props.filter(p => p.required && p.name !== 'modelValue').slice(0, 3)
  const attrs = required.map(p => ` ${p.name}="${p.options?.[0] ?? p.default ?? ''}"`).join('')
  return hasSlot ? `<${name}${attrs}>Text</${name}>` : `<${name}${attrs} />`
}
