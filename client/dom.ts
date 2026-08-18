/**
 * Slidev keeps more than one slide mounted at a time, since the next one is
 * pre-rendered for transitions and previews, so `#slide-content` is not a
 * single slide. Every DOM lookup Studio makes has to be scoped to the slide
 * being edited, or a click can be traced back to a completely different
 * slide's Markdown.
 */

export const CANVAS_SELECTOR = '#slide-content'

export function canvasElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>(CANVAS_SELECTOR)
}

/** The rendered root of one slide, as marked by Slidev's `SlideWrapper`. */
export function slideElement(no: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(`${CANVAS_SELECTOR} [data-slidev-no="${no}"]`)
}

/** Every block on that slide the editor can map back to source. */
export function mappedElements(no: number): HTMLElement[] {
  const root = slideElement(no)
  return root ? [...root.querySelectorAll<HTMLElement>('[data-studio-src]')] : []
}

/** Whether a node belongs to the slide currently being edited. */
export function belongsToSlide(node: Element, no: number): boolean {
  const root = slideElement(no)
  return !!root && root.contains(node)
}
