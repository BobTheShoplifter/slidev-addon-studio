import { describe, expect, it } from 'vitest'
import { classesOf, readable, readTextStyles } from '../client/md/text-styles'

/**
 * The reader walks a handful of CSSOM properties, so the tests build rule
 * trees directly rather than parsing CSS. A real `document.styleSheets` has the
 * same shape, which is covered against a running deck.
 */
function style(selectorText: string, props: Record<string, string> = {}): any {
  return { type: 1, selectorText, style: { getPropertyValue: (p: string) => props[p] ?? '' } }
}

function layer(name: string, rules: any[]): any {
  return { type: 0, name, cssRules: rules }
}

function media(rules: any[]): any {
  return { type: 4, cssRules: rules }
}

function keyframes(name: string): any {
  return { type: 7, name, cssRules: [{ keyText: '0%' }] }
}

function sheet(rules: any[]): any {
  return { cssRules: rules }
}

describe('readTextStyles', () => {
  it('offers the classes declared in the slidev-text layer and nothing else', () => {
    const styles = readTextStyles([sheet([
      style('.pair'),
      layer('slidev-text', [style('.accent'), style('.cw .muted')]),
      layer('base', [style('.hl')]),
    ])])
    expect(styles.map(s => s.name)).toEqual(['accent', 'muted'])
  })

  it('labels a style from --label, or from its name', () => {
    const styles = readTextStyles([sheet([
      layer('slidev-text', [
        style('.accent', { '--label': '"Brand red"' }),
        style('.big-number'),
      ]),
    ])])
    expect(styles).toEqual([
      { name: 'accent', label: 'Brand red' },
      { name: 'big-number', label: 'Big number' },
    ])
  })

  it('groups styles by nested layer', () => {
    const styles = readTextStyles([sheet([
      layer('slidev-text', [
        style('.accent'),
        layer('emphasis', [style('.loud')]),
      ]),
      layer('slidev-text.labels', [style('.tag')]),
    ])])
    expect(styles).toEqual([
      { name: 'accent', label: 'Accent' },
      { name: 'loud', label: 'Loud', group: 'emphasis' },
      { name: 'tag', label: 'Tag', group: 'labels' },
    ])
  })

  it('merges blocks across sheets, later ones winning', () => {
    const theme = sheet([layer('slidev-text', [style('.accent', { '--label': '"Theme"' }), style('.quiet')])])
    const deck = sheet([layer('slidev-text', [style('.accent'), style('.loud')])])
    const styles = readTextStyles([theme, deck])
    // The deck's rule comes later but has no label, so the theme's is kept.
    expect(styles.map(s => `${s.name}:${s.label}`)).toEqual(['quiet:Quiet', 'accent:Theme', 'loud:Loud'])
  })

  it('looks through media queries and imports, and skips what it cannot read', () => {
    const imported = sheet([layer('slidev-text', [style('.imported')])])
    const blocked: any = {
      get cssRules(): any {
        throw new Error('cross-origin')
      },
    }
    const styles = readTextStyles([
      blocked,
      sheet([
        layer('slidev-text', [media([style('.narrow')])]),
        { type: 3, styleSheet: imported },
        keyframes('slidev-text'),
      ]),
    ])
    expect(styles.map(s => s.name)).toEqual(['narrow', 'imported'])
  })
})

describe('classesOf', () => {
  it('takes the last compound when it is one bare class', () => {
    expect(classesOf('.accent')).toEqual(['accent'])
    expect(classesOf('.slidev-layout .accent')).toEqual(['accent'])
    expect(classesOf('.cw > .accent, .muted')).toEqual(['accent', 'muted'])
  })

  it('leaves anything more specific to the cascade', () => {
    expect(classesOf('.accent strong')).toEqual([])
    expect(classesOf('strong.accent')).toEqual([])
    expect(classesOf('.accent:hover')).toEqual([])
    expect(classesOf('p')).toEqual([])
  })
})

describe('readable', () => {
  it('turns a class name into words', () => {
    expect(readable('accent')).toBe('Accent')
    expect(readable('big-number')).toBe('Big number')
    expect(readable('snake_case')).toBe('Snake case')
  })
})
