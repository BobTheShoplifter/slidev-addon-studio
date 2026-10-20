/**
 * The deck's named text styles, read from the stylesheets the page already has.
 *
 * A theme, an addon or a deck declares the classes meant for a run of text by
 * putting them in a cascade layer called `slidev-text`:
 *
 * ```css
 * @layer slidev-text {
 *   .accent { color: var(--brand-red); }
 *   .quiet { --label: "Muted"; color: #8a8a90; }
 * }
 * ```
 *
 * Those are what the inline editor offers when a word is selected, and what it
 * writes back as `[word]{.accent}`. Nothing else qualifies: a utility class, a
 * layout helper or a rule in any other layer is not a text style, however much
 * it may happen to colour text. The layer is the declaration of intent, which
 * no amount of parsing could recover from the rules themselves.
 *
 * Reading the layer from the CSS Object Model rather than from files keeps the
 * convention indifferent to where the rules live: one file or many, plain CSS
 * or a preprocessor, the theme's or the deck's. Blocks with the same layer name
 * merge, so a deck can add to what its theme declares, and a nested layer such
 * as `slidev-text.emphasis` groups the styles it holds.
 */

export const TEXT_STYLE_LAYER = 'slidev-text'

export interface TextStyle {
  /** The class name, which is what the Markdown carries. */
  name: string
  /** What the dropdown shows: `--label` from the rule, or the name made readable. */
  label: string
  /** The nested layer the style was declared in, if any. */
  group?: string
}

/**
 * The parts of a CSS rule this walks.
 *
 * Structural rather than the DOM's own classes, so the reading can be tested
 * without a CSSOM implementation. A real `CSSRule` satisfies these already.
 */
export interface RuleLike {
  type?: number
  /** A style rule's selector. */
  selectorText?: string
  /** A layer block's name, which is also what a keyframes rule carries. */
  name?: string
  /** Children of a grouping rule: a layer, a media query, a supports block. */
  cssRules?: Iterable<RuleLike>
  /** The sheet an `@import` pulled in. */
  styleSheet?: SheetLike | null
  style?: { getPropertyValue: (property: string) => string }
}

export interface SheetLike {
  /** May throw for a sheet from another origin, which is skipped. */
  cssRules: Iterable<RuleLike>
}

/** `CSSRule.KEYFRAMES_RULE`: the one other grouping rule that carries a name. */
const KEYFRAMES_RULE = 7

export function readTextStyles(sheets: Iterable<SheetLike>): TextStyle[] {
  const found = new Map<string, TextStyle>()

  for (const sheet of sheets)
    walkSheet(sheet, '', found)

  return [...found.values()]
}

function walkSheet(sheet: SheetLike | null | undefined, layer: string, found: Map<string, TextStyle>) {
  let rules: Iterable<RuleLike>
  try {
    rules = sheet?.cssRules ?? []
  }
  catch {
    return
  }
  walkRules(rules, layer, found)
}

function walkRules(rules: Iterable<RuleLike>, layer: string, found: Map<string, TextStyle>) {
  for (const rule of rules) {
    if (rule.styleSheet) {
      walkSheet(rule.styleSheet, layer, found)
      continue
    }

    if (rule.selectorText != null) {
      const group = groupOf(layer)
      if (group === null)
        continue
      for (const name of classesOf(rule.selectorText)) {
        const label = labelOf(rule, name)
        // Later rules win, matching how the stylesheets themselves cascade,
        // but a label given earlier is kept when the later rule has none.
        const previous = found.get(name)
        found.delete(name)
        found.set(name, {
          name,
          label: label ?? previous?.label ?? readable(name),
          ...(group ? { group } : previous?.group ? { group: previous.group } : {}),
        })
      }
      continue
    }

    if (!rule.cssRules)
      continue

    const isLayer = rule.name != null && rule.type !== KEYFRAMES_RULE
    const inner = isLayer ? (layer ? `${layer}.${rule.name}` : rule.name!) : layer
    walkRules(rule.cssRules, inner, found)
  }
}

/**
 * The group a layer path puts a style in, or `null` outside the convention.
 *
 * `slidev-text` is the root with no group; `slidev-text.emphasis` groups as
 * "emphasis"; anything else is some other layer entirely.
 */
function groupOf(layer: string): string | null {
  if (layer === TEXT_STYLE_LAYER)
    return ''
  if (layer.startsWith(`${TEXT_STYLE_LAYER}.`))
    return layer.slice(TEXT_STYLE_LAYER.length + 1)
  return null
}

const RE_CLASS = /^\.([A-Z_a-z][\w-]*)$/

/**
 * The class names a selector declares as styles.
 *
 * Only a selector whose last compound is one bare class counts: `.accent` and
 * `.slidev-layout .accent` both name the style `accent`, while `.accent strong`,
 * `strong.accent` and `.accent:hover` describe something more specific than a
 * style a word can be given, so they are left to the cascade.
 */
export function classesOf(selectorText: string): string[] {
  const names: string[] = []
  for (const selector of selectorText.split(',')) {
    const last = selector.trim().split(/\s*[>+~]\s*|\s+/).pop() ?? ''
    const name = last.match(RE_CLASS)?.[1]
    if (name && !names.includes(name))
      names.push(name)
  }
  return names
}

function labelOf(rule: RuleLike, name: string): string | null {
  const raw = rule.style?.getPropertyValue('--label').trim() ?? ''
  if (!raw)
    return null
  const unquoted = raw.replace(/^(["'])([\s\S]*)\1$/, '$2').trim()
  return unquoted || readable(name)
}

/** `big-number` reads as "Big number". */
export function readable(name: string): string {
  const words = name.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
