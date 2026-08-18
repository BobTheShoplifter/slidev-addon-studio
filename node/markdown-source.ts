import type MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'

/**
 * Attribute carrying the Markdown line range a rendered element came from.
 * Value is `"<startLine>,<endLine>"`, zero-based and end-exclusive, relative to
 * the *slide content*, the part of the slide after its frontmatter. That is the same
 * coordinate space as `SlideInfo.content`, which is what the editor patches.
 *
 * It is a hint, not a contract: a custom `setup/transformers.ts` can shift
 * lines before markdown-it sees them, so the client re-validates every range
 * against the real source and re-locates the block when it does not match.
 * See `client/md/locate.ts`.
 */
export const SOURCE_ATTR = 'data-studio-src'

/** Token type the range came from, used to pick the right editing strategy. */
export const KIND_ATTR = 'data-studio-kind'

/**
 * Source tag name of an HTML or component block. A component's rendered root
 * element rarely shares its name, since `<Pill>` may render a `<span>`, so the
 * client cannot recover this from the DOM.
 */
export const TAG_ATTR = 'data-studio-tag'

/** Block-level tokens we can safely hang an attribute on. */
const BLOCK_TOKENS: Record<string, string> = {
  heading_open: 'heading',
  paragraph_open: 'paragraph',
  bullet_list_open: 'list',
  ordered_list_open: 'list',
  list_item_open: 'list-item',
  blockquote_open: 'quote',
  table_open: 'table',
  hr: 'rule',
}

/**
 * Matches the first opening tag of an HTML block so we can inject into it the
 * same way Slidev injects `:markdownSource` for `v-drag`.
 */
const RE_FIRST_TAG = /<([A-Za-z][\w.-]*)((?:\s[^>]*?)?)(\/?)>/

/** Tags we never annotate: they either vanish or break when given attributes. */
const SKIPPED_TAGS = new Set(['template', 'style', 'script', 'br', 'hr', 'v-clicks', 'v-click', 'v-after', 'v-switch', 'v-drag'])

export interface StudioMarkdownOptions {
  /**
   * Which HTML blocks get annotated.
   * - `all`: plain HTML elements and Vue components (default)
   * - `html`: only lowercase HTML elements, never components
   * - `off`: markdown blocks only
   *
   * Components receive the attribute through Vue's fallthrough attrs. That is
   * harmless for single-root components but logs an "extraneous attribute"
   * warning for fragment-root ones, which is why this is tunable.
   */
  annotate?: 'all' | 'html' | 'off'
}

function isComponentTag(tag: string) {
  return /^[A-Z]/.test(tag) || tag.includes('-')
}

/**
 * Teaches markdown-it to stamp every block it renders with the Markdown line
 * range it came from, so the editor can map a clicked DOM node back to the
 * source it must rewrite.
 *
 * Register it from a Vite config:
 *
 * ```ts
 * import { studioMarkdownSetup } from 'slidev-addon-studio/node/markdown-source'
 * export default { slidev: { markdown: { markdownSetup: studioMarkdownSetup } } }
 * ```
 */
export function studioMarkdownSetup(md: MarkdownIt, options: StudioMarkdownOptions = {}) {
  // The Vite config cannot see the deck's headmatter, so the addon's own Vite
  // plugin, which can, leaves the resolved mode here for this to pick up.
  const annotate = options.annotate ?? (globalThis as any).__SLIDEV_STUDIO_ANNOTATE__ ?? 'all'

  // Guard against double registration when a user composes several setups.
  if ((md as any).__studioSourceInstalled)
    return
  ;(md as any).__studioSourceInstalled = true

  // The Vite config and the addon's Vite plugin are loaded through different
  // module graphs, so `globalThis` is the only channel they share. The plugin
  // reads this to warn when a project's own `markdownSetup` has replaced ours.
  ;(globalThis as any).__SLIDEV_STUDIO_MARKDOWN__ = true

  const _parse = md.parse.bind(md)

  md.parse = function (src: string, env: any): Token[] {
    const tokens = _parse(src, env)
    annotateTokens(tokens, annotate)
    return tokens
  }
}

function annotateTokens(tokens: Token[], annotate: 'all' | 'html' | 'off') {
  for (const token of tokens) {
    if (token.children?.length)
      annotateTokens(token.children, annotate)

    if (!token.map)
      continue

    const [start, end] = token.map
    const range = `${start},${Math.max(start + 1, end)}`

    const kind = BLOCK_TOKENS[token.type]
    if (kind) {
      token.attrSet(SOURCE_ATTR, range)
      token.attrSet(KIND_ATTR, kind)
      continue
    }

    if (token.type === 'html_block' && annotate !== 'off')
      token.content = injectIntoHtml(token.content, range, annotate)
  }
}

function injectIntoHtml(html: string, range: string, annotate: 'all' | 'html') {
  return html.replace(RE_FIRST_TAG, (full, tag: string, attrs: string, selfClose: string) => {
    const lower = tag.toLowerCase()
    if (SKIPPED_TAGS.has(lower) || SKIPPED_TAGS.has(tag))
      return full
    if (attrs.includes(SOURCE_ATTR))
      return full
    const component = isComponentTag(tag)
    if (component && annotate !== 'all')
      return full
    const kind = component ? 'component' : 'html'
    // `attrs` is either empty or starts with whitespace, so a tag with no
    // attributes still needs a separator before the injected one.
    const space = attrs.endsWith(' ') ? '' : ' '
    return `<${tag}${attrs}${space}${SOURCE_ATTR}="${range}" ${KIND_ATTR}="${kind}" ${TAG_ATTR}="${tag}"${selfClose ? " /" : ""}>`
  })
}
