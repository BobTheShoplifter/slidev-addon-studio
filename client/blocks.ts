/**
 * The plain Markdown building blocks.
 *
 * The palette is otherwise a list of components, which leaves no way to add a
 * heading or a paragraph without typing Markdown. These sit above the
 * components and insert exactly what you would have written by hand.
 */
export interface BasicBlock {
  name: string
  description: string
  /** Markdown inserted into the slide. */
  snippet: string
  /** A short sample rendered in the card, since these have no component. */
  sample: string
}

export const BASIC_BLOCKS: BasicBlock[] = [
  {
    name: 'Heading',
    description: 'A section heading',
    snippet: '## Heading',
    sample: '## Heading',
  },
  {
    name: 'Text',
    description: 'A paragraph',
    snippet: 'Some text.',
    sample: 'Some text.',
  },
  {
    name: 'List',
    description: 'A bullet list',
    snippet: '- First point\n- Second point\n- Third point',
    sample: '- First point',
  },
  {
    name: 'Numbered list',
    description: 'An ordered list',
    snippet: '1. First step\n2. Second step',
    sample: '1. First step',
  },
  {
    name: 'Quote',
    description: 'A block quote',
    snippet: '> Something worth quoting.',
    sample: '> Something worth…',
  },
  {
    name: 'Divider',
    description: 'A horizontal rule',
    // Not `---`, which Slidev reads as a slide separator.
    snippet: '***',
    sample: '***',
  },
  {
    name: 'Image',
    description: 'An image from public/',
    snippet: '![Alt text](/image.png)',
    sample: '![Alt text](…)',
  },
  {
    name: 'Code',
    description: 'A fenced code block',
    snippet: '```ts\nconst answer = 42\n```',
    sample: '```ts',
  },
  {
    name: 'Two columns',
    description: 'A side by side layout',
    snippet: '<div class="grid grid-cols-2 gap-8">\n\n<div>Left</div>\n\n<div>Right</div>\n\n</div>',
    sample: 'Left | Right',
  },
]
