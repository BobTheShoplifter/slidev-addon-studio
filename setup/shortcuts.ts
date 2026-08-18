import type { NavOperations, ShortcutOptions } from '@slidev/types'
import { canRedo, canUndo, useStudioHistory } from '../client/composables/useSlideSource'
import { selection, studioOpen } from '../client/state'

/**
 * `E` toggles the editor, chosen because Slidev leaves it free and it is the
 * same key most drawing tools use for "edit".
 *
 * Undo and redo are bound only while Studio is open, so a plain presentation
 * keeps the browser's own behaviour.
 */
export default (_nav: NavOperations, shortcuts: ShortcutOptions[]): ShortcutOptions[] => {
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
    {
      name: 'studio_deselect',
      key: 'escape',
      fn: () => studioOpen.value && (selection.value = null),
    },
  ]
}
