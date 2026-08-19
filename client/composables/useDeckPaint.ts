import { computed } from 'vue'
import { isDark } from '@slidev/client/logic/dark.ts'

/**
 * The deck's own background and text colour.
 *
 * Thumbnails mount real slide components inside the Studio dock, which is dark
 * by design. Slidev paints a slide's background on `#slide-content` rather than
 * on the layout, so a thumbnail rendered anywhere else inherits the dock's
 * colours instead: light decks came out as white text on black. Reading the
 * live slide covers any theme, in either colour scheme, without the editor
 * knowing a single theme variable.
 */
export function useDeckPaint() {
  return computed(() => {
    // Read so the paint is recomputed when the deck's colour scheme flips.
    void isDark.value

    const slide = typeof document === 'undefined'
      ? null
      : document.querySelector('#slide-content')
    if (!slide)
      return { background: isDark.value ? '#121212' : '#ffffff', color: isDark.value ? '#f8f8f8' : '#181818' }

    const style = getComputedStyle(slide)
    // A transparent slide means the colour lives further up, on the page.
    const background = style.backgroundColor === 'rgba(0, 0, 0, 0)'
      ? getComputedStyle(document.body).backgroundColor
      : style.backgroundColor
    return { background, color: style.color }
  })
}
