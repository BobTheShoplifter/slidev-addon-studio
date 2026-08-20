import { describe, expect, it } from 'vitest'
import { blockShape, canEditVisually, serialiseBlock, serialiseInline } from '../client/md/inline'

/**
 * The serialiser walks a handful of standard node properties, so the tests
 * build node trees directly rather than parsing HTML. That keeps them free of
 * a DOM implementation, and what they cover is the walking itself. The round
 * trip through a real browser DOM is covered end to end against a running deck.
 */
function text(value: string): any {
  return { nodeType: 3, textContent: value }
}

function el(tag: string, children: any[] = [], attributes: Record<string, string> = {}): any {
  const node: any = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    childNodes: children,
    attributes: Object.entries(attributes).map(([name, value]) => ({ name, value })),
    getAttribute: (name: string) => attributes[name] ?? null,
    get children() {
      return children.filter(child => child.nodeType === 1)
    },
    get textContent() {
      return children.map((child: any) => child.textContent).join('')
    },
  }
  return node
}

const root = (...children: any[]) => ({ childNodes: children })

describe('blockShape', () => {
  it('reads the markers that make a block what it is', () => {
    expect(blockShape('## A heading')).toMatchObject({ kind: 'heading', prefix: '## ' })
    expect(blockShape('Just prose.')).toMatchObject({ kind: 'paragraph', prefix: '' })
    expect(blockShape('> quoted')).toMatchObject({ kind: 'quote', prefix: '> ', perLine: true })
    expect(blockShape('- one\n- two')).toMatchObject({ kind: 'list', prefix: '- ', perLine: true })
    expect(blockShape('1. one\n2. two')).toMatchObject({ kind: 'list', perLine: true })
  })

  it('refuses blocks whose Markdown is not prose', () => {
    expect(blockShape('<Pill>Hi</Pill>')).toBeNull()
    expect(blockShape('```ts\ncode\n```')).toBeNull()
    expect(blockShape('| a | b |\n| - | - |')).toBeNull()
    expect(blockShape('# Heading\nand more')).toBeNull()
    expect(blockShape('- one\nnot an item')).toBeNull()
  })
})

describe('serialiseInline', () => {
  it('writes the marks back as Markdown', () => {
    expect(serialiseInline(root(text('plain text')))).toBe('plain text')
    expect(serialiseInline(root(text('a '), el('strong', [text('bold')]), text(' word')))).toBe('a **bold** word')
    expect(serialiseInline(root(el('em', [text('italic')])))).toBe('*italic*')
    expect(serialiseInline(root(el('s', [text('gone')])))).toBe('~~gone~~')
    expect(serialiseInline(root(el('code', [text('x = 1')])))).toBe('`x = 1`')
    expect(serialiseInline(root(el('a', [text('docs')], { href: 'https://sli.dev' })))).toBe('[docs](https://sli.dev)')
    expect(serialiseInline(root(el('img', [], { src: '/a.png', alt: 'a shot' })))).toBe('![a shot](/a.png)')
    expect(serialiseInline(root(text('one'), el('br'), text('two')))).toBe('one<br>two')
  })

  it('nests marks', () => {
    const tree = root(el('strong', [text('bold '), el('em', [text('and italic')])]))
    expect(serialiseInline(tree)).toBe('**bold *and italic***')
  })

  it('unwraps a wrapper that carries nothing', () => {
    expect(serialiseInline(root(el('span', [text('plain')]), text(' text')))).toBe('plain text')
    expect(serialiseInline(root(el('strong', [text('bold')], { 'data-studio-src': '1,2' })))).toBe('**bold**')
  })

  it('refuses anything it cannot write back exactly', () => {
    // A styled span is the author's own markup: dropping it would delete it.
    expect(serialiseInline(root(el('span', [text('hacket')], { class: 'red' })))).toBeNull()
    // A component is not Markdown at all.
    expect(serialiseInline(root(text('text '), el('pill', [text('Hi')])))).toBeNull()
    expect(serialiseInline(root(el('div', [text('a block')])))).toBeNull()
  })

  it('escapes what would otherwise become markup', () => {
    expect(serialiseInline(root(text('2 * 3 * 4')))).toBe('2 \\* 3 \\* 4')
    expect(serialiseInline(root(text('snake_case_name')))).toBe('snake\\_case\\_name')
    expect(serialiseInline(root(text('[not a link]')))).toBe('\\[not a link\\]')
    // Inside a code span the text is literal, so escaping would show through.
    expect(serialiseInline(root(el('code', [text('a * b')])))).toBe('`a * b`')
  })
})

describe('serialiseBlock', () => {
  it('keeps a heading a heading', () => {
    const shape = blockShape('## A heading')!
    const rendered = el('h2', [text('A '), el('strong', [text('new')]), text(' heading')])
    expect(serialiseBlock(rendered, shape)).toBe('## A **new** heading')
  })

  it('gives every list item its marker back', () => {
    const shape = blockShape('- one\n- two')!
    const list = el('ul', [
      el('li', [text('first')]),
      el('li', [text('second '), el('em', [text('item')])]),
    ])
    expect(serialiseBlock(list, shape)).toBe('- first\n- second *item*')
  })

  it('refuses a list holding something it cannot write', () => {
    const shape = blockShape('- one')!
    const list = el('ul', [el('li', [el('span', [text('one')], { class: 'red' })])])
    expect(serialiseBlock(list, shape)).toBeNull()
  })
})

describe('canEditVisually', () => {
  it('accepts a block it can reproduce', () => {
    const shape = blockShape('## A **bold** heading')!
    const rendered = el('h2', [text('A '), el('strong', [text('bold')]), text(' heading')])
    expect(canEditVisually('## A **bold** heading', rendered, shape)).toBe(true)
  })

  it('ignores escaping and spacing, which are faithful', () => {
    const shape = blockShape('2 * 3 * 4')!
    expect(canEditVisually('2 * 3 * 4', el('p', [text('2 * 3 * 4')]), shape)).toBe(true)
  })

  it('refuses a block it would quietly reshape', () => {
    // Two paragraphs in one quote come back as two `>` lines with the blank one
    // between them gone, which renders as a single paragraph.
    const shape = blockShape('> one\n>\n> two')!
    const quote = el('blockquote', [el('p', [text('one')]), el('p', [text('two')])])
    expect(canEditVisually('> one\n>\n> two', quote, shape)).toBe(false)
  })

  it('refuses a block whose markup it does not recognise', () => {
    const shape = blockShape('# Ikke bli <span class="red">hacket.</span>')!
    const heading = el('h1', [text('Ikke bli '), el('span', [text('hacket.')], { class: 'red' })])
    expect(canEditVisually('# Ikke bli <span class="red">hacket.</span>', heading, shape)).toBe(false)
  })
})
