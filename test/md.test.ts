import { describe, expect, it } from 'vitest'
import { clearClicks, findWrapper, readClicks, writeClicks } from '../client/md/clicks'
import { readClasses, writeClasses } from '../client/md/classes'
import { formatPos, parsePos, readDrag, removeDrag, writeDrag } from '../client/md/drag'
import { getBlock, insertAfter, moveBlock, removeBlock, replaceBlock, unwrap } from '../client/md/lines'
import { resolveRange } from '../client/md/locate'
import { findAttr, firstTag, writeAttr } from '../client/md/tags'

const SLIDE = [
  '# Ikke bli <span class="red">hacket.</span>', // 0
  '', // 1
  '<p class="lead">Some text</p>', // 2
  '', // 3
  '- one', // 4
  '- two', // 5
].join('\n')

describe('lines', () => {
  it('reads and replaces exactly the given range', () => {
    expect(getBlock(SLIDE, [2, 3])).toBe('<p class="lead">Some text</p>')
    expect(replaceBlock(SLIDE, [2, 3], '<p>New</p>')).toContain('<p>New</p>')
    expect(replaceBlock(SLIDE, [2, 3], '<p>New</p>')).toContain('# Ikke bli')
  })

  it('inserts after a block without touching its neighbours', () => {
    const next = insertAfter(SLIDE, [0, 1], '## Sub')
    expect(next.split('\n').slice(0, 4)).toEqual([
      '# Ikke bli <span class="red">hacket.</span>',
      '',
      '## Sub',
      '',
    ])
  })

  it('removes a block and the hole it leaves behind', () => {
    const next = removeBlock(SLIDE, [2, 3])
    expect(next).not.toContain('Some text')
    expect(next).not.toMatch(/\n\n\n/)
  })

  it('moves a block past its sibling in both directions', () => {
    const down = moveBlock(SLIDE, [0, 1], 1)
    expect(down.indexOf('Some text')).toBeLessThan(down.indexOf('Ikke bli'))
    const back = moveBlock(down, [2, 3], -1)
    expect(back.indexOf('Ikke bli')).toBeLessThan(back.indexOf('Some text'))
  })

  it('takes back the padding a wrapper added', () => {
    const wrapped = ['before', '', '<v-click>', '', '# Title', '', '</v-click>', '', 'after'].join('\n')
    const { content, removedAbove } = unwrap(wrapped, 2, 6)
    expect(content).toBe(['before', '', '# Title', '', 'after'].join('\n'))
    expect(removedAbove).toBe(2)
  })
})

describe('tags', () => {
  it('parses the opening tag of a block', () => {
    const tag = firstTag('<Pill color="red">Hi</Pill>')
    expect(tag?.name).toBe('Pill')
    expect(tag?.selfClosing).toBe(false)
  })

  it('adds, replaces and removes attributes in place', () => {
    let block = '<Pill color="red">Hi</Pill>'
    block = writeAttr(block, 'v-click', true)
    expect(block).toBe('<Pill color="red" v-click>Hi</Pill>')

    block = writeAttr(block, 'v-click', '3')
    expect(block).toBe('<Pill color="red" v-click="3">Hi</Pill>')

    block = writeAttr(block, 'v-click', null)
    expect(block).toBe('<Pill color="red">Hi</Pill>')
  })

  it('understands binding prefixes and modifiers', () => {
    const attr = findAttr('<div v-click.hide="2" :pos="[1,2]">x</div>', 'v-click')
    expect(attr?.value).toBe('2')
    expect(attr?.modifiers).toEqual(['hide'])
    expect(findAttr('<div :pos="[1,2]">x</div>', 'pos')?.bound).toBe(true)
  })

  it('separates the first attribute on a bare tag', () => {
    expect(writeAttr('<Pill>Hi</Pill>', 'v-drag', '[1,2,3]')).toBe('<Pill v-drag="[1,2,3]">Hi</Pill>')
    expect(writeAttr('<Pill/>', 'v-click', true)).toBe('<Pill v-click />')
  })

  it('keeps a self-closing tag self-closing', () => {
    expect(writeAttr('<Mascot name="shield" />', 'v-click', true)).toBe('<Mascot name="shield" v-click />')
  })
})

describe('clicks', () => {
  it('puts the directive straight on an element', () => {
    const next = writeClicks(SLIDE, [2, 3], { via: 'attr', at: '2', hide: false, stagger: false, animation: 'up', every: 1, depth: 1 })
    expect(next).toContain('<p class="lead" v-click.up="2">Some text</p>')
    expect(readClicks(next, [2, 3])).toMatchObject({ via: 'attr', at: '2', animation: 'up' })
  })

  it('wraps a Markdown block instead, since it has nowhere to put an attribute', () => {
    const next = writeClicks(SLIDE, [0, 1], { via: 'wrapper', at: '+1', hide: false, stagger: false, animation: '', every: 1, depth: 1 })
    expect(next.split('\n').slice(0, 5)).toEqual([
      '<v-click>',
      '',
      '# Ikke bli <span class="red">hacket.</span>',
      '',
      '</v-click>',
    ])
    expect(findWrapper(next, [2, 3])?.tag).toBe('v-click')
    expect(readClicks(next, [2, 3])).toMatchObject({ via: 'wrapper', at: '+1' })
  })

  it('uses v-clicks when children should reveal one at a time', () => {
    const next = writeClicks(SLIDE, [4, 6], { via: 'wrapper', at: '+1', hide: false, stagger: true, animation: '', every: 2, depth: 1 })
    expect(next).toContain('<v-clicks every="2">')
  })

  it('round trips back to the original source', () => {
    const ranges: [number, number][] = [[0, 1], [2, 3], [4, 6]]
    for (const range of ranges) {
      const on = writeClicks(SLIDE, range, { via: 'attr', at: '3', hide: true, stagger: false, animation: 'fade', every: 1, depth: 1 })
      // A Markdown block gets a wrapper, which pushes it down two lines.
      const shifted: [number, number] = findWrapper(on, [range[0] + 2, range[1] + 2])
        ? [range[0] + 2, range[1] + 2]
        : [range[0], range[1]]
      expect(clearClicks(on, shifted)).toBe(SLIDE)
    }
  })
})

describe('drag', () => {
  it('parses both the directive and component spellings of a position', () => {
    expect(parsePos('[10,20,300,NaN]')).toEqual({ x: 10, y: 20, w: 300, h: null, rotate: 0 })
    expect(parsePos('10,20,300,_')).toEqual({ x: 10, y: 20, w: 300, h: null, rotate: 0 })
    expect(parsePos('10,20,300,80,15')).toEqual({ x: 10, y: 20, w: 300, h: 80, rotate: 15 })
    expect(parsePos('nonsense')).toBeNull()
  })

  it('writes auto height the way each spelling expects', () => {
    const pos = { x: 1, y: 2, w: 3, h: null, rotate: 0 }
    expect(formatPos(pos, 'attr')).toBe('[1,2,3,NaN]')
    expect(formatPos(pos, 'prop')).toBe('1,2,3,_')
  })

  it('gives an element the directive and a Markdown block a wrapper', () => {
    const pos = { x: 10, y: 20, w: 300, h: null, rotate: 0 }

    const onElement = writeDrag(SLIDE, [2, 3], pos)
    expect(onElement).toContain('<p class="lead" v-drag="[10,20,300,NaN]">')
    expect(readDrag(onElement, [2, 3])?.via).toBe('attr')

    const onHeading = writeDrag(SLIDE, [0, 1], pos)
    expect(onHeading).toContain('<v-drag pos="10,20,300,_">')
    expect(readDrag(onHeading, [2, 3])?.via).toBe('wrapper')
  })

  it('updates an existing position rather than nesting another wrapper', () => {
    const once = writeDrag(SLIDE, [0, 1], { x: 10, y: 20, w: 300, h: null, rotate: 0 })
    const twice = writeDrag(once, [2, 3], { x: 40, y: 50, w: 300, h: null, rotate: 0 })
    expect(twice.match(/<v-drag/g)).toHaveLength(1)
    expect(twice).toContain('pos="40,50,300,_"')
  })

  it('returns a block to the flow exactly as it was', () => {
    const positioned = writeDrag(SLIDE, [0, 1], { x: 10, y: 20, w: 300, h: null, rotate: 0 })
    expect(removeDrag(positioned, [2, 3])).toBe(SLIDE)

    const onElement = writeDrag(SLIDE, [2, 3], { x: 10, y: 20, w: 300, h: null, rotate: 0 })
    expect(removeDrag(onElement, [2, 3])).toBe(SLIDE)
  })
})

describe('classes', () => {
  it('uses the class attribute when there is a tag', () => {
    const next = writeClasses(SLIDE, [2, 3], 'text-xl opacity-80')
    expect(next).toContain('<p class="text-xl opacity-80">')
    expect(readClasses(next, [2, 3])).toBe('text-xl opacity-80')
  })

  it('falls back to MDC attributes on a Markdown block', () => {
    const next = writeClasses(SLIDE, [0, 1], 'text-red')
    expect(next.split('\n')[0]).toBe('# Ikke bli <span class="red">hacket.</span> {.text-red}')
    expect(readClasses(next, [0, 1])).toBe('text-red')
    expect(writeClasses(next, [0, 1], '').split('\n')[0]).toBe('# Ikke bli <span class="red">hacket.</span>')
  })

  it('keeps MDC attributes it does not own', () => {
    const withId = '# Title {#intro}'
    const next = writeClasses(withId, [0, 1], 'big')
    expect(next).toContain('#intro')
    expect(next).toContain('.big')
  })
})

describe('locate', () => {
  const heading = { kind: 'heading' as const, text: 'ikke bli hacket' }

  it('trusts a hint that matches the source', () => {
    expect(resolveRange(SLIDE, [0, 1], heading)).toEqual([0, 1])
  })

  it('sees through inline HTML the DOM has already resolved', () => {
    expect(resolveRange(SLIDE, [0, 1], { kind: 'heading', text: 'ikke bli hacket' })).toEqual([0, 1])
  })

  it('finds the block again when the hint has drifted', () => {
    const shifted = `<!-- a note -->\n\n${SLIDE}`
    expect(resolveRange(shifted, [0, 1], heading)).toEqual([2, 3])
  })

  it('matches a component block by its tag', () => {
    const source = '<Pill color="red">Hi</Pill>'
    expect(resolveRange(source, [0, 1], { kind: 'component', tag: 'Pill' })).toEqual([0, 1])
    expect(resolveRange(source, [9, 10], { kind: 'component', tag: 'Pill' })).toEqual([0, 1])
  })

  it('refuses to guess when nothing matches', () => {
    expect(resolveRange(SLIDE, [0, 1], { kind: 'heading', text: 'a different heading entirely' })).toBeNull()
  })

  it('keeps a fenced code block whole', () => {
    const source = ['# Title', '', '```ts', '', 'const a = 1', '```', '', 'after'].join('\n')
    expect(resolveRange(source, null, { kind: 'heading', text: 'title' })).toEqual([0, 1])
  })
})
