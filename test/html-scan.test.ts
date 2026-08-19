import { describe, expect, it } from 'vitest'
import { scanTags } from '../node/html-scan'

describe('scanTags', () => {
  it('finds every tag in a block, each on its own line', () => {
    const html = [
      '<div class="grid">',
      '  <Mascot name="shield-1" :size="110" />',
      '  <Mascot name="lock-1" :size="110" />',
      '</div>',
    ].join('\n')

    const tags = scanTags(html)
    expect(tags.map(t => [t.name, t.startLine, t.endLine])).toEqual([
      ['div', 0, 4],
      ['Mascot', 1, 2],
      ['Mascot', 2, 3],
    ])
  })

  it('gives a multi-line element the span of its closing tag', () => {
    const html = ['<div class="mt-8">', '  <Sticker :rotate="-3">', '    Hi', '  </Sticker>', '</div>'].join('\n')
    const tags = scanTags(html)
    expect(tags.map(t => [t.name, t.startLine, t.endLine])).toEqual([
      ['div', 0, 5],
      ['Sticker', 1, 4],
    ])
  })

  it('leaves prose inside a comment alone', () => {
    const html = '<!--\n  Copy this to decks/<my-talk>.md\n-->\n<p>After</p>'
    expect(scanTags(html).map(t => t.name)).toEqual(['p'])
  })

  it('does not scan inside raw text elements', () => {
    const html = '<pre>\n  <div>not markup</div>\n</pre>\n<p>After</p>'
    expect(scanTags(html).map(t => [t.name, t.startLine])).toEqual([['pre', 0], ['p', 3]])
  })

  it('handles an attribute value containing a closing bracket', () => {
    const html = '<Chart :domain="a > b" title="x" />'
    const [tag] = scanTags(html)
    expect(tag.name).toBe('Chart')
    expect(tag.selfClosing).toBe(true)
    expect(html.slice(0, tag.insertAt)).toBe('<Chart :domain="a > b" title="x" ')
  })

  it('treats void elements as complete without a closing tag', () => {
    const html = '<p>One<br>Two</p>\n<p>Three</p>'
    expect(scanTags(html).map(t => [t.name, t.startLine, t.endLine])).toEqual([
      ['p', 0, 1],
      ['br', 0, 1],
      ['p', 1, 2],
    ])
  })

  it('leaves an unclosed element owning only its own line', () => {
    const html = '<div>\n  <p>Never closed\n</div>'
    expect(scanTags(html).map(t => [t.name, t.startLine, t.endLine])).toEqual([
      ['div', 0, 3],
      ['p', 1, 2],
    ])
  })

  it('reports where an attribute can be inserted', () => {
    const html = '<div class="mt-8">'
    const [tag] = scanTags(html)
    expect(html.slice(0, tag.insertAt)).toBe('<div class="mt-8"')
  })
})

describe('multi-line tags', () => {
  it('gives a tag that spans lines all of them', () => {
    const html = [
      '<LivePoll',
      '  id="poll"',
      '  :options="[',
      "    'Yes',",
      "    'No',",
      '  ]"',
      '/>',
    ].join('\n')

    const [tag] = scanTags(html)
    expect(tag.name).toBe('LivePoll')
    expect([tag.startLine, tag.endLine]).toEqual([0, 7])
  })

  it('still gives a single-line tag one line', () => {
    const [tag] = scanTags('<Pill color="red">Hi</Pill>')
    expect([tag.startLine, tag.endLine]).toEqual([0, 1])
  })

  it('records where each tag opens, even past a "<" in an attribute value', () => {
    const html = '<Pill label="a < b">Hi</Pill>'
    const [tag] = scanTags(html)
    expect(tag.start).toBe(0)
    expect(html.slice(tag.start, tag.insertAt)).toBe('<Pill label="a < b"')
  })

  it('reports nesting depth, not scan order', () => {
    const html = '<div class="a">A</div>\n<div class="b"><Pill>B</Pill></div>'
    const tags = scanTags(html)
    expect(tags.map(t => `${t.name}:${t.depth}`)).toEqual(['div:0', 'div:0', 'Pill:1'])
  })
})
