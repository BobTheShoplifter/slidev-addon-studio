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
