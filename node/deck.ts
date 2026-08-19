import type { ResolvedSlidevOptions } from '@slidev/types'
import { readFile, writeFile } from 'node:fs/promises'
import type { RawDeck } from './slide-source'
import { joinDeck, prettifyRaw, splitDeck } from './slide-source'

/**
 * Deck-level operations: everything that changes how many slides there are or
 * what order they are in. Slidev's own `/__slidev/slides/:no.json` endpoint
 * only patches a slide in place, so these rewrite the Markdown file directly
 * and let the file watcher push the result back to the browser.
 */

export type DeckAction =
  | { action: 'insert', after: number, content?: string, frontmatter?: string, note?: string }
  | { action: 'duplicate', no: number }
  | { action: 'remove', no: number }
  | { action: 'move', no: number, to: number }

export interface DeckSlideRef {
  no: number
  filepath: string
  index: number
}

export interface DeckResult {
  ok: true
  /** Slide number to focus after the edit. */
  no: number
  total: number
}

/**
 * Maps a presentation slide number to the file and in-file index it lives at.
 * A deck can be spread over several files via `src:` imports, so this walks
 * the loaded data rather than assuming one file.
 */
function locate(options: ResolvedSlidevOptions, no: number): DeckSlideRef {
  const slide = options.data.slides[no - 1]
  if (!slide)
    throw new Error(`Slide ${no} does not exist (deck has ${options.data.slides.length})`)
  return { no, filepath: slide.source.filepath, index: slide.source.index }
}

function assertNotHeadmatter(options: ResolvedSlidevOptions, ref: DeckSlideRef, what: string) {
  if (ref.filepath === options.data.entry.filepath && ref.index === 0)
    throw new Error(`Cannot ${what} the first slide of the entry file: its frontmatter is the deck's global configuration.`)
}

const DEFAULT_SLIDE = '# New slide\n'

export async function applyDeckAction(options: ResolvedSlidevOptions, payload: DeckAction): Promise<DeckResult> {
  const total = options.data.slides.length

  switch (payload.action) {
    case 'insert': {
      const anchor = locate(options, clamp(payload.after, 1, total))
      const raw = prettifyRaw(payload.frontmatter, payload.content ?? DEFAULT_SLIDE, payload.note)
      await mutateFile(anchor.filepath, (slides) => {
        slides.splice(anchor.index + 1, 0, raw)
        return slides
      })
      return { ok: true, no: Math.min(anchor.no + 1, total + 1), total: total + 1 }
    }

    case 'duplicate': {
      const ref = locate(options, payload.no)
      // The first slide of the entry file carries the deck's own configuration.
      // Copying it verbatim gave the new slide `theme`, `title` and `info` as
      // slide-level frontmatter, which the author then had to clean out by
      // hand, so the copy keeps the body and drops that block.
      const isHeadmatter = ref.filepath === options.data.entry.filepath && ref.index === 0
      await mutateFile(ref.filepath, (slides, deck) => {
        const source = slides[ref.index]
        const copy = isHeadmatter ? withoutFrontmatter(deck.slides[ref.index], source) : source
        slides.splice(ref.index + 1, 0, copy)
        return slides
      })
      return { ok: true, no: ref.no + 1, total: total + 1 }
    }

    case 'remove': {
      const ref = locate(options, payload.no)
      assertNotHeadmatter(options, ref, 'delete')
      if (total <= 1)
        throw new Error('A deck must keep at least one slide')
      await mutateFile(ref.filepath, (slides) => {
        slides.splice(ref.index, 1)
        return slides
      })
      return { ok: true, no: Math.max(1, ref.no - 1), total: total - 1 }
    }

    case 'move': {
      const ref = locate(options, payload.no)
      const target = locate(options, clamp(payload.to, 1, total))
      assertNotHeadmatter(options, ref, 'move')
      if (target.filepath !== ref.filepath)
        throw new Error('Cannot move a slide across Markdown files')
      if (target.index === 0 && ref.filepath === options.data.entry.filepath)
        throw new Error('Cannot move a slide in front of the deck headmatter')
      await mutateFile(ref.filepath, (slides) => {
        const [moved] = slides.splice(ref.index, 1)
        slides.splice(target.index, 0, moved)
        return slides
      })
      return { ok: true, no: target.no, total }
    }
  }
}

/** The slide's body, without the frontmatter block in front of it. */
function withoutFrontmatter(slide: { start: number, contentStart: number } | undefined, raw: string) {
  if (!slide || slide.contentStart <= slide.start)
    return raw
  return raw.split('\n').slice(slide.contentStart - slide.start).join('\n').replace(/^\n+/, '')
}

async function mutateFile(filepath: string, mutate: (slides: string[], deck: RawDeck) => string[]) {
  const raw = await readFile(filepath, 'utf-8')
  const deck = splitDeck(raw)
  const next = mutate(deck.slides.map(s => s.raw), deck)
  const output = joinDeck(next)
  if (output !== raw)
    await writeFile(filepath, output, 'utf-8')
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
