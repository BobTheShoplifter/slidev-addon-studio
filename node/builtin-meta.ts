import type { StudioMeta } from './metadata'

/**
 * Studio metadata for the components Slidev ships.
 *
 * A component author describes their component with a `<studio>` block, but
 * Slidev's own components live in `node_modules` and cannot carry one. Their
 * props are read from source like anyone else's; this only adds what source
 * cannot say: what a prop is called in plain words, that `color` is a colour
 * rather than a string, and which of them are worth showing at all.
 *
 * Descriptions come from each component's own header where it has one, so this
 * stays a labelling table rather than a second set of docs to keep in step.
 */
export const BUILTIN_META: Record<string, StudioMeta> = {
  Arrow: {
    category: 'Slidev',
    props: {
      x1: { label: 'Start x' },
      y1: { label: 'Start y' },
      x2: { label: 'End x' },
      y2: { label: 'End y' },
      width: { label: 'Thickness' },
      color: { label: 'Colour', control: 'color' },
      twoWay: { label: 'Arrow at both ends' },
    },
  },

  AutoFitText: {
    category: 'Slidev',
    props: {
      modelValue: { label: 'Text' },
      max: { label: 'Largest size' },
      min: { label: 'Smallest size' },
      multiLine: { label: 'Wrap lines' },
    },
  },

  BlueSky: {
    category: 'Slidev',
    props: {
      uri: { label: 'Post URL' },
      scale: { label: 'Scale' },
    },
  },

  Link: {
    category: 'Slidev',
    props: {
      to: { label: 'Slide or path' },
      title: { label: 'Link text' },
    },
  },

  SlidevVideo: {
    category: 'Slidev',
    description: 'A video that plays with the slide',
    props: {
      autoplay: { label: 'Autoplay', options: ['true', 'false', 'once'] },
      autoreset: { label: 'Rewind on', options: ['slide', 'click'] },
      poster: { label: 'Poster image' },
      printPoster: { label: 'Poster when printed' },
      timestamp: { label: 'Start at (s)' },
      printTimestamp: { label: 'Frame when printed' },
      controls: { label: 'Show controls' },
    },
  },

  Toc: {
    category: 'Slidev',
    props: {
      columns: { label: 'Columns' },
      maxDepth: { label: 'Deepest level' },
      minDepth: { label: 'Shallowest level' },
      mode: { label: 'Show', options: ['all', 'onlyCurrentTree', 'onlySiblings'] },
      start: { label: 'Start at level' },
      listClass: { hidden: true },
      listStyle: { hidden: true },
    },
  },

  Transform: {
    category: 'Slidev',
    props: {
      scale: { label: 'Scale' },
      origin: { label: 'Origin' },
    },
  },

  Tweet: {
    category: 'Slidev',
    props: {
      id: { label: 'Tweet id or URL' },
      scale: { label: 'Scale' },
      conversation: { label: 'Show conversation' },
      cards: { label: 'Media cards', options: ['visible', 'hidden'] },
    },
  },

  Youtube: {
    category: 'Slidev',
    props: {
      id: { label: 'Video id' },
      width: { label: 'Width' },
      height: { label: 'Height' },
    },
  },
}
