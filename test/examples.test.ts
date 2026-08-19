import { describe, expect, it } from 'vitest'
import { isCompilable, parseUsageExample } from '../node/metadata'

describe('usage examples', () => {
  it('accepts an ellipsis inside a string, since that is just text', () => {
    expect(isCompilable(`<Carousel :items="[{ src: '/a.png', caption: '1 · …' }]" />`)).toBe(true)
  })

  it('rejects one that abbreviates the expression itself', () => {
    expect(isCompilable(`<Timeline :items="[{ date: '21. jun' }, …]" />`)).toBe(false)
    expect(isCompilable(`<QuizCard :tells="['a', ...]">`)).toBe(false)
  })

  it('refuses an abbreviated example rather than inserting something that breaks the slide', () => {
    const code = [
      '<!--',
      'Timeline',
      '',
      `<Timeline :items="[{ date: '21. jun 2023', text: '…' }, …]" />`,
      '-->',
    ].join('\n')
    expect(parseUsageExample(code, 'Timeline')).toBeUndefined()
  })

  it('still takes a complete example', () => {
    const code = ['<!--', 'Usage:', '', '<Tweet id="20" />', '-->'].join('\n')
    expect(parseUsageExample(code, 'Tweet')).toBe('<Tweet id="20" />')
  })
})

describe('example completeness', () => {
  it('follows an example to its own closing tag, not to the first child that self-closes', () => {
    const code = [
      '<!--',
      'Apply scaling or transforming to elements.',
      '',
      'Usage:',
      '',
      '<Transform :scale="0.5">',
      '  <YourElements />',
      '</Transform>',
      '-->',
    ].join('\n')

    expect(parseUsageExample(code, 'Transform'))
      .toBe('<Transform :scale="0.5">\n  <YourElements />\n</Transform>')
  })

  it('still accepts a genuinely self-closing example', () => {
    const code = ['<!--', '<Youtube id="abc" />', '-->'].join('\n')
    expect(parseUsageExample(code, 'Youtube')).toBe('<Youtube id="abc" />')
  })
})
