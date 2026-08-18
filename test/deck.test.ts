import { describe, expect, it } from 'vitest'
import { joinDeck, prettifyRaw, splitDeck } from '../node/slide-source'
import { parseDocBlock, parseProps } from '../node/catalog'

const DECK = `---
theme: default
title: Demo
---

# First

---
layout: center
---

# Second

<!--
A note with --- inside it
-->

---

# Third

\`\`\`md
---
this is not a separator
---
\`\`\`
`

describe('splitDeck', () => {
  it('finds every slide without being fooled by fences or notes', () => {
    const deck = splitDeck(DECK)
    expect(deck.slides).toHaveLength(3)
    expect(deck.slides[0].raw).toContain('# First')
    expect(deck.slides[1].raw).toContain('# Second')
    expect(deck.slides[2].raw).toContain('this is not a separator')
  })

  it('round trips a deck it did not change', () => {
    const deck = splitDeck(DECK)
    expect(joinDeck(deck.slides.map(s => s.raw))).toBe(DECK)
  })

  it('keeps the rest of the deck byte-identical when a slide is inserted', () => {
    const deck = splitDeck(DECK)
    const raws = deck.slides.map(s => s.raw)
    raws.splice(1, 0, prettifyRaw(undefined, '# Inserted'))
    const next = splitDeck(joinDeck(raws))
    expect(next.slides).toHaveLength(4)
    expect(next.slides[1].raw.trim()).toBe('# Inserted')
    expect(next.slides[0].raw).toBe(deck.slides[0].raw)
    expect(next.slides[3].raw).toBe(deck.slides[2].raw)
  })

  it('survives removing and re-adding the same slide', () => {
    const raws = splitDeck(DECK).slides.map(s => s.raw)
    const [removed] = raws.splice(1, 1)
    raws.splice(1, 0, removed)
    expect(joinDeck(raws)).toBe(DECK)
  })
})

describe('prettifyRaw', () => {
  it('writes frontmatter, body and note in Slidev order', () => {
    expect(prettifyRaw('layout: center', '# Hi', 'speak slowly')).toBe(
      '---\nlayout: center\n---\n\n# Hi\n\n<!--\nspeak slowly\n-->\n',
    )
  })
})

describe('component metadata', () => {
  it('reads the optional @studio block, including folded snippets', () => {
    const meta = parseDocBlock([
      '<!-- @studio',
      'description: A rounded label',
      'category: Content',
      'snippet: |',
      '  <Pill color="red">',
      '    Label',
      '  </Pill>',
      '-->',
      '<template><span /></template>',
    ].join('\n'))

    expect(meta.description).toBe('A rounded label')
    expect(meta.category).toBe('Content')
    expect(meta.snippet).toBe('<Pill color="red">\n  Label\n</Pill>')
  })

  it('extracts typed props and their string unions', () => {
    const props = parseProps(`
      <script setup lang="ts">
      const props = withDefaults(defineProps<{
        color?: 'red' | 'green' | 'ink'
        label: string
      }>(), {
        color: 'red',
      })
      </script>
    `)

    expect(props).toHaveLength(2)
    expect(props[0]).toMatchObject({ name: 'color', required: false, default: 'red', options: ['red', 'green', 'ink'] })
    expect(props[1]).toMatchObject({ name: 'label', required: true })
  })

  it('extracts options-style props too', () => {
    const props = parseProps(`
      <script>
      export default {
        props: {
          size: { type: Number, default: 3 },
          label: { type: String, required: true },
        },
      }
      </script>
    `)
    expect(props.map(p => p.name)).toEqual(['size', 'label'])
    expect(props[1].required).toBe(true)
  })
})
