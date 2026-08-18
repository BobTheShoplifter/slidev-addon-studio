import type MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import { tagSignature } from '../shared/signature.ts'
import { scanTags } from './html-scan.ts'

/**
 * Attribute carrying the Markdown line range a rendered element came from.
 * Value is `"<startLine>,<endLine>"`, zero-based and end-exclusive, relative to
 * the *slide content*, the part of the slide after its frontmatter. That is the
 * same coordinate space as `SlideInfo.content`, which is what the editor
 * patches.
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

/** Fingerprint of the opening tag, so identical siblings can be told apart. */
export const SIG_ATTR = 'data-studio-sig'

/**
 * Set on a tag that is not the outermost one in its block. Such an element
 * shares a Markdown block with its neighbours, so actions that insert or move
 * whole blocks do not apply to it.
 */
export const NESTED_ATTR = 'data-studio-nested'

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

/** Raw HTML shows up under two token types, depending on how it was written. */
const HTML_TOKENS = new Set(['html_block', 'html_inline'])

/** Tags we never annotate: they either vanish or break when given attributes. */
const SKIPPED_TAGS = new Set(['template', 'style', 'script', 'br', 'hr', 'v-clicks', 'v-click', 'v-after', 'v-switch', 'v-drag'])

export interface StudioMarkdownOptions {
  /**
   * Which HTML blocks get annotated.
   * - `all`: plain HTML elements and Vue components (default)
   * - `html`: only plain HTML elements, never components
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

  installFenceAnnotation(md)
}

/**
 * Code blocks need their own path.
 *
 * Slidev replaces markdown-it's fence rule with one that builds a string from a
 * chain of transformers and wraps the result in `<CodeBlockWrapper>`. Nothing
 * in that chain reads the token's attributes, so a fence can never be annotated
 * the ordinary way. Wrapping the rule and injecting into the markup it returns
 * is the only place the range can be attached, and it costs no extra DOM: the
 * attribute lands on the wrapper, which passes it to the `<pre>`.
 */
function installFenceAnnotation(md: MarkdownIt) {
  const original = md.renderer.rules.fence
  if (!original)
    return

  md.renderer.rules.fence = function (this: any, tokens, idx, options, env, self) {
    const rendered = (original as any).call(this, tokens, idx, options, env, self)
    const map = tokens[idx]?.map
    if (!map)
      return rendered

    const range = `${map[0]},${Math.max(map[0] + 1, map[1])}`
    const stamp = (html: string) => html.replace(
      /^(\s*)<([A-Za-z][\w.-]*)/,
      `$1<$2 ${SOURCE_ATTR}="${range}" ${KIND_ATTR}="code"`,
    )

    // Slidev's fence rule is async, so the result may be a promise.
    return rendered && typeof rendered.then === 'function'
      ? rendered.then(stamp)
      : stamp(rendered)
  } as typeof md.renderer.rules.fence
}

function annotateTokens(tokens: Token[], annotate: 'all' | 'html' | 'off') {
  for (const token of tokens) {
    if (token.children?.length)
      annotateTokens(token.children, annotate)

    if (!token.map || token.hidden)
      continue

    const [start, end] = token.map
    const range = `${start},${Math.max(start + 1, end)}`

    const kind = BLOCK_TOKENS[token.type]
    if (kind) {
      token.attrSet(SOURCE_ATTR, range)
      token.attrSet(KIND_ATTR, kind)
      continue
    }

    // `<Pill>Label</Pill>` alone on a line is not an HTML *block* to
    // markdown-it: it arrives as a top-level `html_inline` with no paragraph
    // around it. Slidev treats both the same way for `v-drag`, and so must
    // this, or a component written on one line would be invisible here.
    if (HTML_TOKENS.has(token.type) && annotate !== 'off')
      token.content = annotateHtmlBlock(token.content, start, annotate)
  }
}

/**
 * Annotates every tag in a chunk of raw HTML, each with its own line range.
 *
 * A block of raw HTML is one Markdown token however much is inside it, so a
 * grid of twelve components is a single block. Stamping only the outermost tag
 * meant a click on any of those components resolved to the wrapper instead, and
 * their props were unreachable.
 */
function annotateHtmlBlock(html: string, blockStart: number, annotate: 'all' | 'html') {
  const tags = scanTags(html)
  if (!tags.length)
    return html

  let result = html

  // Applied back to front so earlier offsets stay valid as text is inserted.
  for (let i = tags.length - 1; i >= 0; i--) {
    const tag = tags[i]
    const lower = tag.name.toLowerCase()
    if (SKIPPED_TAGS.has(lower) || SKIPPED_TAGS.has(tag.name))
      continue

    const component = isComponentTag(tag.name)
    if (component && annotate !== 'all')
      continue
    if (tag.attrs.includes(SOURCE_ATTR))
      continue

    const start = blockStart + tag.startLine
    const end = blockStart + Math.max(tag.startLine + 1, tag.endLine)
    const source = html.slice(html.lastIndexOf('<', tag.insertAt), tag.insertAt)

    const attributes = [
      ` ${SOURCE_ATTR}="${start},${end}"`,
      ` ${KIND_ATTR}="${component ? 'component' : 'html'}"`,
      ` ${TAG_ATTR}="${tag.name}"`,
      ` ${SIG_ATTR}="${tagSignature(source)}"`,
      i > 0 ? ` ${NESTED_ATTR}="1"` : '',
    ].join('')

    result = result.slice(0, tag.insertAt) + attributes + result.slice(tag.insertAt)
  }

  return result
}
