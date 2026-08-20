import type { ContextMenuItem } from '@slidev/types'
import type { ComputedRef } from 'vue'
import { computed } from 'vue'
import {
  deleteBlock,
  duplicateBlock,
  editText,
  freePosition,
  isPositioned,
  moveBlockBy,
  returnToFlow,
} from '../client/actions'
import { studioContext } from '../client/context'
import { selection, studioOpen } from '../client/state'

/**
 * Right-click on the canvas.
 *
 * Slidev already puts navigation, drawing and presenter mode there, and a
 * canvas editor is exactly the kind of tool where the menu is expected to know
 * what you are pointing at. So the block's own actions come first when
 * something is selected, and Slidev's own follow.
 *
 * Nothing here is new behaviour: every item calls the same function the Element
 * panel calls, so the menu cannot drift away from the panel.
 *
 * Studio is an authoring tool, and a built deck is not being authored. Slidev
 * gates the panel and the toolbar button on `__DEV__` already; the menu has to
 * gate itself, or a published deck offers to open an editor that was never
 * bundled with it.
 */
const authoring = __DEV__ && __SLIDEV_FEATURE_EDITOR__

export default (items: ComputedRef<ContextMenuItem[]>): ComputedRef<ContextMenuItem[]> => {
  if (!authoring)
    return items

  return computed(() => {
    const slidev = items.value

    if (!studioOpen.value) {
      return [
        ...slidev,
        'separator',
        {
          icon: 'i-carbon:pen',
          label: 'Edit slides with Studio',
          action: () => (studioOpen.value = true),
        },
      ]
    }

    const studio = studioContext.value
    const target = selection.value

    // Studio is open but nothing is selected, or the block could not be traced
    // back to the Markdown, in which case none of these could be honoured.
    if (!studio || !target?.range) {
      return [
        ...slidev,
        'separator',
        {
          icon: 'i-carbon:close',
          label: 'Close Studio',
          action: () => (studioOpen.value = false),
        },
      ]
    }

    const positioned = isPositioned(studio.content(), target.range)

    // `label` is what the selection badge shows: `H1`, `Text`, `<Pill>`. As a
    // heading in a sentence "Edit h1" reads badly and "Edit <Pill>" reads fine,
    // so a heading is named for what it is.
    const name = /^H[1-6]$/.test(target.label) ? 'heading' : target.label.startsWith('<') ? target.label : target.label.toLowerCase()

    const mine: ContextMenuItem[] = [
      {
        icon: 'i-carbon:text-annotation-toggle',
        label: `Edit ${name}`,
        action: () => editText(),
      },
      positioned
        ? {
            icon: 'i-carbon:align-box-top-left',
            label: 'Return to flow',
            action: () => returnToFlow(studio, target),
          }
        : {
            icon: 'i-carbon:move',
            label: 'Free position',
            action: () => freePosition(studio, target),
          },
      {
        icon: 'i-carbon:copy',
        label: 'Duplicate',
        action: () => duplicateBlock(studio, target),
      },
      {
        icon: 'i-carbon:trash-can',
        label: `Delete ${name}`,
        action: () => deleteBlock(studio, target),
      },
      // An element sharing a Markdown block with its siblings has no line range
      // of its own to move, so reordering it would move the wrong thing.
      {
        small: true,
        icon: 'i-carbon:arrow-up',
        label: 'Move earlier',
        action: () => moveBlockBy(studio, target, -1),
        disabled: target.nested,
      },
      {
        small: true,
        icon: 'i-carbon:arrow-down',
        label: 'Move later',
        action: () => moveBlockBy(studio, target, 1),
        disabled: target.nested,
      },
    ]

    return [...mine, 'separator', ...slidev]
  })
}
