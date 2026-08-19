import { describe, expect, it } from 'vitest'
import { parseProps, shapeOf } from '../node/catalog'

/**
 * The catalog reads a component's own source to build the inspector, so these
 * cover the TypeScript shapes a real component is written in rather than the
 * tidy ones.
 */
describe('parseProps', () => {
  it('keeps a generic type whole', () => {
    const code = `
      <script setup lang="ts">
      defineProps<{
        entries: Record<string, string>
        tally: Map<string, number>
        label: string
      }>()
      </script>
    `
    const props = parseProps(code)
    expect(props.map(p => p.name)).toEqual(['entries', 'tally', 'label'])
    expect(props.find(p => p.name === 'entries')?.type).toBe('Record<string, string>')
    expect(props.find(p => p.name === 'tally')?.type).toBe('Map<string, number>')
  })

  it('reads every default, even past one that returns an object', () => {
    const code = `
      <script setup lang="ts">
      withDefaults(defineProps<{
        config?: { theme: string }
        label?: string
        dense?: boolean
      }>(), {
        config: () => ({ theme: 'dark' }),
        label: 'Hei',
        dense: true,
      })
      </script>
    `
    const props = parseProps(code)
    expect(props.find(p => p.name === 'label')?.default).toBe('Hei')
    // A boolean that defaults to true decides whether "No" writes `:x="false"`
    // or removes the attribute, so losing it changes what the editor writes.
    expect(props.find(p => p.name === 'dense')?.default).toBe('true')
  })

  it('reads the row fields of an array of records', () => {
    const code = `
      <script setup lang="ts">
      defineProps<{
        items: { year: string, text: string, highlight?: boolean }[]
      }>()
      </script>
    `
    const [items] = parseProps(code)
    expect(shapeOf(items, code)?.map(f => f.name)).toEqual(['year', 'text', 'highlight'])
  })
})
