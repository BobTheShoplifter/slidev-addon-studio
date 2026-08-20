import type { NavOperations, ShortcutOptions } from '@slidev/types'
import { canRedo, canUndo, useStudioHistory } from '../client/composables/useSlideSource'
import { studioOpen } from '../client/state'

/**
 * `E` toggles the editor, chosen because Slidev leaves it free and it is the
 * same key most drawing tools use for "edit".
 *
 * Undo and redo are bound only while Studio is open, so a plain presentation
 * keeps the browser's own behaviour.
 *
 * Escape is deliberately not here. It backs out one layer at a time, which
 * depends on what has focus, and a second binding that always cleared the
 * selection meant cancelling an inline edit also lost the block being edited.
 * `useSelection` owns it.
 */
const authoring = __DEV__ && __SLIDEV_FEATURE_EDITOR__

export default (_nav: NavOperations, shortcuts: ShortcutOptions[]): ShortcutOptions[] => {
  // Same reason as the context menu: nothing to toggle in a built deck, and
  // `E` should stay free for whatever the deck itself wants to do with it.
  if (!authoring)
    return shortcuts

  const history = useStudioHistory()

  return [
    ...shortcuts,
    {
      name: 'studio_toggle',
      key: 'e',
      fn: () => (studioOpen.value = !studioOpen.value),
    },
    {
      name: 'studio_undo',
      key: 'ctrl+z',
      fn: () => studioOpen.value && canUndo.value && history.undo(),
    },
    {
      name: 'studio_redo',
      key: 'ctrl+shift+z',
      fn: () => studioOpen.value && canRedo.value && history.redo(),
    },
  ]
}
