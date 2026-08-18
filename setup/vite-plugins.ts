import type { ResolvedSlidevOptions } from '@slidev/types'
import { studioPlugin } from '../node/plugin'

/**
 * Slidev calls this with the fully resolved options, including every theme
 * and addon root, which is what lets Studio build an accurate catalog of the
 * components a given deck can actually use.
 *
 * Written as a plain default export rather than through `defineVitePluginsSetup`
 * so `@slidev/types` stays a types-only dependency.
 */
export default (options: ResolvedSlidevOptions) => [studioPlugin(options)]
