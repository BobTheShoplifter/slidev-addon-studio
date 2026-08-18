import type { ConfigEnv } from 'vite'
import { studioMarkdownSetup } from './node/markdown-source.ts'

/**
 * Slidev merges a `vite.config.ts` found at the root of any theme or addon.
 * This is the only supported way to reach into the Markdown pipeline, which
 * Studio needs so that rendered elements carry the source range they came
 * from.
 *
 * Annotations are dev-only: a built or exported deck is never touched.
 *
 * If your own project sets `slidev.markdown.markdownSetup`, yours wins over
 * this one and Studio loses click-to-select. Call `studioMarkdownSetup(md)`
 * from your setup to get it back. Studio warns on startup when that happens.
 */
export default ({ command }: ConfigEnv) => {
  if (command !== 'serve')
    return {}

  return {
    slidev: {
      markdown: {
        markdownSetup: studioMarkdownSetup,
      },
    },
  }
}
