/** A line range inside a slide's Markdown content: `[start, end)`, zero-based. */
export type SourceRange = [start: number, end: number]

export type TargetKind =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'list-item'
  | 'quote'
  | 'table'
  | 'rule'
  | 'html'
  | 'component'
  | 'unknown'

export interface StudioTarget {
  /** The rendered element the user picked. */
  el: HTMLElement
  /** Slide this element belongs to. */
  no: number
  /** Where it lives in the slide's Markdown, once resolved against the source. */
  range: SourceRange | null
  kind: TargetKind
  /** Tag name for html/component targets. */
  tag?: string
  /** True when the block is wrapped in, or carries, a `v-drag` position. */
  positioned: boolean
  /** Short human label for the UI. */
  label: string
}

/** Free position of a `v-drag` element, in slide canvas units. */
export interface DragPos {
  x: number
  y: number
  w: number
  /** `null` means "auto height", which `v-drag` writes as `_` or `NaN`. */
  h: number | null
  rotate: number
}

export interface ClickConfig {
  /** `undefined` = always visible. */
  at?: number | [number, number]
  hide?: boolean
  /** Children revealed one by one, i.e. a `<v-clicks>` wrapper. */
  stagger?: boolean
  /** Motion preset id, or `undefined` for none. */
  motion?: string
}

export interface CatalogComponent {
  name: string
  file: string
  source: 'builtin' | 'theme' | 'addon' | 'project'
  origin: string
  description?: string
  category?: string
  snippet: string
  preview: string
  props: { name: string, type?: string, required?: boolean, default?: string, options?: string[] }[]
  previewable: boolean
  load?: () => Promise<any>
}

export interface CatalogLayout {
  name: string
  file: string
  source: CatalogComponent['source']
  origin: string
  description?: string
  load?: () => Promise<any>
}

export interface StudioAsset {
  url: string
  name: string
  size: number
  kind: 'image' | 'video'
}
