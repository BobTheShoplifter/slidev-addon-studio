import { describe, expect, it } from 'vitest'
import { readClicks, writeClicks } from '../client/md/clicks'
import { readDrag, writeDrag } from '../client/md/drag'
import { getBlock } from '../client/md/lines'
import { readProp, writeProp } from '../client/md/props'
import { opensWithTag } from '../client/md/tags'

/**
 * End to end QA against a running deck.
 *
 * Skipped unless `STUDIO_QA_URL` points at a `slidev` server, since it edits
 * real slides. For every component in the catalog it finds that component on
 * its own slide and checks the three things a user actually does: move it,
 * change a prop, animate it. Each edit is posted for real and the slide is
 * recompiled, so an edit that produces markup Vue cannot compile fails here
 * rather than in someone's deck. Every slide is restored afterwards.
 *
 *   pnpm slidev decks/qa-studio.md --port 3060
 *   STUDIO_QA_URL=http://localhost:3060 pnpm test
 */
const BASE = process.env.STUDIO_QA_URL
const suite = BASE ? describe : describe.skip

interface Slide { no: number, content: string }

async function catalog() {
  const response = await fetch(`${BASE}/@studio/catalog`)
  return await response.json() as { components: { name: string, props: any[] }[] }
}

async function slides(): Promise<Slide[]> {
  const found: Slide[] = []
  for (let no = 1; no < 200; no++) {
    const data = await fetch(`${BASE}/__slidev/slides/${no}.json`).then(r => r.json())
    if (typeof data?.content !== 'string')
      break
    found.push({ no, content: data.content })
  }
  return found
}

async function write(no: number, content: string) {
  await fetch(`${BASE}/__slidev/slides/${no}.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  // The endpoint returns once the file is written; invalidating the module is
  // the watcher's job and happens a moment later. Recompiling before that would
  // read the previous transform and pass no matter what was written.
  await new Promise(resolve => setTimeout(resolve, 400))
}

/**
 * Recompiles the slide, which is where invalid markup shows up.
 *
 * The module id has to be resolved rather than guessed. A path-prefixed guess
 * such as `/decks/qa-studio.md__slidev_3.md` resolves to a *different* Vite
 * module that nothing ever invalidates, so it answers 200 with a transform from
 * the start of the session forever, and this check silently passes whatever it
 * is given. Slidev's own `/@slidev/slides/<no>/md` re-exports the real id.
 */
async function compiles(no: number) {
  const wrapper = await fetch(`${BASE}/@slidev/slides/${no}/md?t=${Date.now()}`).then(r => r.text())
  const id = wrapper.match(/export \* from "([^"]+)"/)?.[1]
  if (!id)
    throw new Error(`Could not resolve the module for slide ${no}`)

  const url = new URL(id, BASE)
  url.searchParams.set('t', String(Date.now()))
  const response = await fetch(url)
  if (!response.ok)
    return false

  // A miss falls through to the SPA shell, which is a 200 that proves nothing.
  const body = await response.text()
  return !body.trimStart().startsWith('<')
}

/** The line the component's opening tag sits on. */
function locate(content: string, name: string): [number, number] | null {
  const lines = content.split('\n')
  const index = lines.findIndex(line => new RegExp(`^\\s*<${name}[\\s/>]`).test(line))
  if (index === -1)
    return null
  let end = index + 1
  if (!/\/>\s*$/.test(lines[index]) && !new RegExp(`</${name}>`).test(lines[index])) {
    while (end < lines.length && !new RegExp(`</${name}>`).test(lines[end]))
      end += 1
    end += 1
  }
  return [index, Math.min(end, lines.length)]
}

suite('every component can be moved, configured and animated', async () => {
  const { components } = await catalog()
  const deck = await slides()

  for (const component of components) {
    const slide = deck.find(s => locate(s.content, component.name))
    if (!slide) {
      it(`${component.name} appears in the QA deck`, () => {
        expect.fail(`${component.name} was not found on any slide`)
      })
      continue
    }

    const range = locate(slide.content, component.name)!
    const original = slide.content

    it(`${component.name} is an element the editor can write to`, () => {
      expect(opensWithTag(getBlock(original, range))).toBeTruthy()
    })

    it(`${component.name} can be moved`, async () => {
      const next = writeDrag(original, range, { x: 100, y: 120, w: 300, h: null, rotate: 0 })
      // A component must take the directive, never a wrapper: a wrapper inside
      // a raw HTML block would end the block and reflow the slide.
      expect(next).toContain(`<${component.name}`)
      expect(next).toMatch(new RegExp(`<${component.name}[^>]*v-drag=`))
      expect(readDrag(next, range)?.pos).toMatchObject({ x: 100, y: 120, w: 300 })

      await write(slide.no, next)
      expect(await compiles(slide.no)).toBe(true)
      await write(slide.no, original)
    })

    it(`${component.name} can be animated`, async () => {
      const next = writeClicks(original, range, {
        via: 'attr',
        at: '2',
        hide: false,
        stagger: false,
        animation: 'fade',
        every: 1,
        depth: 1,
      })
      expect(next).toMatch(new RegExp(`<${component.name}[^>]*v-click`))
      expect(readClicks(next, range)).toMatchObject({ via: 'attr', at: '2', animation: 'fade' })

      await write(slide.no, next)
      expect(await compiles(slide.no)).toBe(true)
      await write(slide.no, original)
    })

    const editable = component.props.find(p => !p.hidden && (p.options?.length || p.type?.includes('string')))
    if (editable) {
      it(`${component.name} can have its ${editable.name} prop set`, async () => {
        const value = editable.options?.[0]?.value ?? 'qa'
        const next = writeProp(original, range, editable, value)
        expect(readProp(next, range, editable)).toBe(value)

        await write(slide.no, next)
        expect(await compiles(slide.no)).toBe(true)
        await write(slide.no, original)
      })
    }
  }
})

suite('the compile check itself', () => {
  it('fails a slide whose markup cannot compile', async () => {
    const deck = await slides()
    const target = deck[1]
    const original = target.content

    await write(target.no, '\n## Broken\n\n<Youtube :id="{{{" />\n')
    const result = await compiles(target.no)
    await write(target.no, original)

    // If this passes, the check is reading a stale module and every other
    // assertion that relies on it is worthless.
    expect(result).toBe(false)
    expect(await compiles(target.no)).toBe(true)
  })
})
