import type { CatalogComponent, CatalogLayout } from '../types'
import { components, config, enabled, layouts } from 'virtual:slidev-studio/catalog'
import { computed, ref } from 'vue'

/**
 * The palette's inventory, built at dev time from every root Slidev resolved:
 * its own builtins, the active theme, each addon, and the project's own
 * `components/` directory. Entries carry a real dynamic import, so a preview
 * renders the actual component rather than a picture of one.
 */

const all = components as CatalogComponent[]
const allLayouts = layouts as CatalogLayout[]

export const catalogEnabled = enabled as boolean
export const studioConfig = config as Record<string, any>

export function useCatalog() {
  const query = ref('')
  const sources = ref<Set<CatalogComponent['source']>>(new Set(['builtin', 'theme', 'addon', 'project']))

  const filtered = computed(() => {
    const needle = query.value.trim().toLowerCase()
    return all.filter((component) => {
      if (!sources.value.has(component.source))
        return false
      if (!needle)
        return true
      return component.name.toLowerCase().includes(needle)
        || component.description?.toLowerCase().includes(needle)
        || component.category?.toLowerCase().includes(needle)
    })
  })

  /** Grouped for display: origin first, so a theme's components stay together. */
  const groups = computed(() => {
    const map = new Map<string, CatalogComponent[]>()
    for (const component of filtered.value) {
      const key = component.category ?? component.origin
      const list = map.get(key) ?? []
      list.push(component)
      map.set(key, list)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  })

  function toggleSource(source: CatalogComponent['source']) {
    const next = new Set(sources.value)
    if (next.has(source))
      next.delete(source)
    else
      next.add(source)
    sources.value = next
  }

  return { query, sources, toggleSource, filtered, groups, components: all, layouts: allLayouts }
}
