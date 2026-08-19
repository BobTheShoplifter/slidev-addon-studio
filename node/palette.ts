import type { ResolvedSlidevOptions } from '@slidev/types'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The deck's own colours, read from the stylesheets it already ships.
 *
 * A theme declares its palette once, as custom properties in its base CSS, and
 * every component then refers to them as `var(--flag-red)`. Offering those as
 * the choices in a colour control means the editor proposes the deck's actual
 * colours rather than an arbitrary wheel, and keeps what it writes referring to
 * the theme instead of freezing a hex that stops following it.
 */

export interface PaletteColor {
  /** The value written into the deck, e.g. `var(--flag-red)`. */
  value: string
  /** The custom property's own name, for display. */
  name: string
  /** What it resolves to in the stylesheet, for a swatch before render. */
  resolved: string
}

const COLOR_VALUE = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|oklch\(|color\()/i
const CSS_EXTENSIONS = new Set(['.css', '.postcss', '.scss'])

/**
 * Only properties declared globally are offered. A `--accent` living under
 * `.card` resolves to nothing at the slide root, so writing `var(--accent)`
 * into a prop would paint nothing at all.
 */
const GLOBAL_SELECTOR = /(?::root|:host|html|body|\*)\s*$/

/** Studio's own stylesheet, whose variables are editor chrome, not deck colours. */
const SELF_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

export async function readPalette(options: ResolvedSlidevOptions): Promise<PaletteColor[]> {
  const roots = [...options.themeRoots, ...options.addonRoots, options.userRoot]
    .filter(root => resolve(root) !== SELF_ROOT)
  const found = new Map<string, PaletteColor>()

  for (const root of roots) {
    for (const file of await listStylesheets(root)) {
      let css = ''
      try {
        css = await readFile(file, 'utf-8')
      }
      catch {
        continue
      }

      for (const [, selector, body] of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
        const global = selector.split(',').some(part => GLOBAL_SELECTOR.test(part.trim()))
        if (!global)
          continue

        for (const [, name, raw] of body.matchAll(/--([\w-]+)\s*:\s*([^;}]+)/g)) {
          const value = raw.trim()
          // The value decides, not the name: anything that opens with a colour
          // function or a hex is one, and nothing else is.
          if (!COLOR_VALUE.test(value))
            continue
          // Later roots win, matching how the stylesheets themselves cascade.
          found.set(name, { value: `var(--${name})`, name, resolved: value })
        }
      }
    }
  }

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name))
}

async function listStylesheets(root: string): Promise<string[]> {
  const files: string[] = []
  for (const dir of ['styles', 'style', '.']) {
    try {
      const entries = await readdir(join(root, dir), { withFileTypes: true, recursive: dir !== '.' })
      for (const entry of entries as any[]) {
        if (entry.isFile() && CSS_EXTENSIONS.has(extname(entry.name)))
          files.push(resolve(entry.parentPath ?? join(root, dir), entry.name))
      }
    }
    catch {}
  }
  return files
}
