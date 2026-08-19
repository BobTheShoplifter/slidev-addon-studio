/// <reference types="@slidev/types/client" />

declare module 'virtual:slidev-studio/catalog' {
  import type { CatalogComponent, CatalogLayout } from './client/types'

  export const components: CatalogComponent[]
  export const layouts: CatalogLayout[]
  export const palette: { value: string, name: string, resolved: string }[]
  export const config: Record<string, any>
  export const enabled: boolean
}

declare const __DEV__: boolean
declare const __SLIDEV_FEATURE_EDITOR__: boolean
