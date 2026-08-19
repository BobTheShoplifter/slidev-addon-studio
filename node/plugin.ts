import type { ResolvedSlidevOptions } from '@slidev/types'
import type { Plugin } from 'vite'
import { join, relative } from 'node:path'
import { buildCatalog } from './catalog'
import { assetRoot, listAssets, saveAsset } from './assets'
import { applyDeckAction } from './deck'

const VIRTUAL_CATALOG = 'virtual:slidev-studio/catalog'
const RESOLVED_CATALOG = `\0${VIRTUAL_CATALOG}`
const API_PREFIX = '/@studio/'
const STUDIO_BLOCK_REQUEST = /[?&]vue&type=studio\b/

/**
 * The node half of Studio.
 *
 * It publishes the component/layout catalog as a virtual module (so palette
 * previews import the real components, lazily), and serves the small dev API
 * used for the edits Slidev's own endpoint cannot express: adding, removing,
 * reordering slides and writing assets into `public/`.
 *
 * Everything here is dev-only. In build and export mode the plugin serves an
 * empty catalog and registers no routes.
 */
export function studioPlugin(options: ResolvedSlidevOptions): Plugin {

  const isDev = options.mode === 'dev' && options.data.config.editor !== false
  const config = studioConfig(options)

  // Handed to `studioMarkdownSetup`, which runs from the merged Vite config and
  // has no other way to learn what the deck asked for.
  ;(globalThis as any).__SLIDEV_STUDIO_ANNOTATE__ = config.annotate ?? 'all'

  return {
    name: 'slidev-studio',
    // Ahead of the Vue plugin, so the `<studio>` block below is claimed before
    // it is handed on as JavaScript.
    enforce: 'pre',

    resolveId(id) {
      if (id === VIRTUAL_CATALOG)
        return RESOLVED_CATALOG
      return null
    },

    async load(id) {
      // A component's metadata lives in a `<studio>` block, which keeps an SFC
      // looking like an SFC to editors. Vue emits an import for every custom
      // block it does not recognise and expects a plugin to answer it; without
      // this the YAML would reach the browser as source and fail to parse.
      if (STUDIO_BLOCK_REQUEST.test(id))
        return 'export default {}'

      if (id !== RESOLVED_CATALOG)
        return null
      if (!isDev)
        return 'export const components = []\nexport const layouts = []\nexport const config = {}\nexport const enabled = false\n'
      return renderCatalogModule(options)
    },

    configureServer(server) {
      if (!isDev)
        return

      // `markdownSetup` is a single slot: a project that defines its own wins
      // over the addon's, which silently costs Studio its click-to-select.
      setTimeout(() => {
        if (!(globalThis as any).__SLIDEV_STUDIO_MARKDOWN__) {
          server.config.logger.warn(
            '[slidev-studio] Markdown source annotations are not installed. '
            + 'Your project defines `slidev.markdown.markdownSetup`, which replaces the addon\'s. '
            + 'Call `studioMarkdownSetup(md)` from it to restore click-to-select.',
          )
        }
      }, 2000)

      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0]
        if (!url?.startsWith(API_PREFIX))
          return next()

        const route = url.slice(API_PREFIX.length)
        try {
          const result = await handle(route, req.method ?? 'GET', req, options)
          if (result === undefined)
            return next()
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        }
        catch (error: any) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: error?.message ?? String(error) }))
        }
      })

      // Keep the palette in sync while the user is writing components.
      const componentDirs = [
        ...options.roots.map(root => join(root, 'components')),
        ...options.roots.map(root => join(root, 'layouts')),
      ]
      server.watcher.on('all', (_event, file) => {
        if (!componentDirs.some(dir => !relative(dir, file).startsWith('..')))
          return
        const mod = server.moduleGraph.getModuleById(RESOLVED_CATALOG)
        if (mod) {
          server.moduleGraph.invalidateModule(mod)
          server.hot.send({ type: 'full-reload' })
        }
      })
    },
  }
}

async function handle(route: string, method: string, req: any, options: ResolvedSlidevOptions) {
  if (route === 'catalog' && method === 'GET')
    return await buildCatalog(options)

  if (route === 'assets' && method === 'GET')
    return { assets: await listAssets(options), root: assetRoot(options) }

  if (route === 'assets' && method === 'POST')
    return await saveAsset(options, await readJson(req))

  if (route === 'deck' && method === 'POST')
    return await applyDeckAction(options, await readJson(req))

  return undefined
}

async function readJson(req: any) {
  const chunks: Buffer[] = []
  for await (const chunk of req)
    chunks.push(chunk)
  const body = Buffer.concat(chunks).toString('utf-8')
  return body ? JSON.parse(body) : {}
}

/**
 * Emits the catalog as a module rather than JSON so each entry can carry a
 * real dynamic import of its component. Palette previews then render the
 * genuine component instead of a screenshot.
 */
/** Options a deck sets under `studio:` in its headmatter. */
export interface StudioConfig {
  /** How much of the rendered slide carries source annotations. */
  annotate?: 'all' | 'html' | 'off'
  /** Component names to keep out of the palette. */
  hideComponents?: string[]
}

export function studioConfig(options: ResolvedSlidevOptions): StudioConfig {
  return ((options.data.config as any).studio ?? {}) as StudioConfig
}

async function renderCatalogModule(options: ResolvedSlidevOptions) {
  const catalog = await buildCatalog(options)
  const config = studioConfig(options)

  const componentLoaders = catalog.components
    .filter(c => c.previewable)
    .map(c => `  ${JSON.stringify(c.name)}: () => import(${JSON.stringify(toFsUrl(c.file))}),`)
    .join('\n')

  const layoutLoaders = catalog.layouts
    .map(l => `  ${JSON.stringify(l.name)}: () => import(${JSON.stringify(toFsUrl(l.file))}),`)
    .join('\n')

  return [
    `const componentLoaders = {\n${componentLoaders}\n}`,
    `const layoutLoaders = {\n${layoutLoaders}\n}`,
    `export const components = ${JSON.stringify(catalog.components)}.map(c => ({ ...c, load: componentLoaders[c.name] }))`,
    `export const layouts = ${JSON.stringify(catalog.layouts)}.map(l => ({ ...l, load: layoutLoaders[l.name] }))`,
    `export const config = ${JSON.stringify(config)}`,
    `export const enabled = true`,
  ].join('\n\n')
}

/** Vite serves files outside the project root through the `/@fs/` prefix. */
function toFsUrl(path: string) {
  return `/@fs/${path.replace(/\\/g, '/').replace(/^\//, '')}`
}
