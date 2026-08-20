/**
 * Local declarations for the parts of `@slidev/client` Studio uses.
 *
 * The client ships uncompiled TypeScript that only typechecks inside Slidev's
 * own build, with its compile-time globals and virtual modules in scope. Rather
 * than drag all of that into this project, the handful of members Studio
 * actually touches are declared here, so `pnpm typecheck` reports problems in
 * Studio's code and nothing else. Vite resolves the real modules at runtime.
 */

declare module '@slidev/client' {
  import type { ClicksContext, SlideRoute } from '@slidev/types'
  import type { ComputedRef, Ref, ShallowRef } from 'vue'

  export interface SlidevNav {
    slides: ShallowRef<SlideRoute[]>
    total: ComputedRef<number>
    currentSlideNo: ComputedRef<number>
    currentSlideRoute: ComputedRef<SlideRoute>
    currentLayout: ComputedRef<string>
    currentFrontmatter: ComputedRef<Record<string, any>>
    clicksContext: ComputedRef<ClicksContext>
    clicks: ComputedRef<number>
    clicksTotal: ComputedRef<number>
    isPrintMode: Ref<boolean>
    isEmbedded: Ref<boolean>
    isNotesViewer: Ref<boolean>
    isPresenter: Ref<boolean>
    go: (page: number, clicks?: number) => void
    next: () => void
    prev: () => void
  }

  export function useNav(): SlidevNav
}

declare module '@slidev/client/env.ts' {
  import type { SlidevConfig } from '@slidev/types'
  import type { ComputedRef } from 'vue'

  export const configs: SlidevConfig & { slidesTitle: string }
  export const slideWidth: ComputedRef<number>
  export const slideHeight: ComputedRef<number>
  export const slideAspect: ComputedRef<number>
}

declare module '@slidev/client/composables/useSlideInfo.ts' {
  import type { SlideInfo, SlidePatch } from '@slidev/types'
  import type { MaybeRef, WritableComputedRef } from 'vue'

  export function useDynamicSlideInfo(no: MaybeRef<number>): {
    info: WritableComputedRef<SlideInfo | null>
    update: (data: SlidePatch, newId?: number) => Promise<SlideInfo | void>
  }
}

declare module '@slidev/client/logic/dark.ts' {
  import type { WritableComputedRef } from 'vue'

  export const isDark: WritableComputedRef<boolean>
  export function toggleDark(value?: boolean): boolean
}

declare module '@slidev/client/logic/contextMenu.ts' {
  export function openContextMenu(x: number, y: number): void
  export function closeContextMenu(): void
}
