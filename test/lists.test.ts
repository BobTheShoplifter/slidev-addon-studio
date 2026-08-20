import { describe, expect, it } from 'vitest'
import { duplicateListItem, listItemUnit, moveListItem } from '../client/md/lines'

const DECK = [
  'Et avsnitt.',
  '',
  '- 2000, et viktig veiskille',
  '  - Notert på Oslo Børs',
  '  - Delvis privatisert',
  '- 1996-2017',
  '',
  'Etterpå.',
].join('\n')

const listOf = (content: string) => content.split('\n').filter(l => l.trim().startsWith('-'))

describe('the unit a list item owns', () => {
  it('takes its nested children with it', () => {
    expect(listItemUnit(DECK, 2)).toEqual([2, 5])
  })

  it('is one line when it has no children', () => {
    expect(listItemUnit(DECK, 3)).toEqual([3, 4])
  })

  it('is nothing for a line that is not an item', () => {
    expect(listItemUnit(DECK, 0)).toBeNull()
  })
})

describe('duplicating a list item', () => {
  it('keeps the copy in the list, at the same level', () => {
    expect(listOf(duplicateListItem(DECK, 3)!)).toEqual([
      '- 2000, et viktig veiskille',
      '  - Notert på Oslo Børs',
      '  - Notert på Oslo Børs',
      '  - Delvis privatisert',
      '- 1996-2017',
    ])
  })

  it('copies a parent together with its children', () => {
    expect(listOf(duplicateListItem(DECK, 2)!)).toEqual([
      '- 2000, et viktig veiskille',
      '  - Notert på Oslo Børs',
      '  - Delvis privatisert',
      '- 2000, et viktig veiskille',
      '  - Notert på Oslo Børs',
      '  - Delvis privatisert',
      '- 1996-2017',
    ])
  })

  it('leaves no blank line, which would end the list', () => {
    expect(duplicateListItem(DECK, 3)).not.toContain('Børs\n\n')
  })
})

describe('moving a list item', () => {
  it('swaps with the sibling below, not with the next block', () => {
    expect(listOf(moveListItem(DECK, 3, 1)!)).toEqual([
      '- 2000, et viktig veiskille',
      '  - Delvis privatisert',
      '  - Notert på Oslo Børs',
      '- 1996-2017',
    ])
  })

  it('swaps with the sibling above', () => {
    expect(listOf(moveListItem(DECK, 4, -1)!)).toEqual([
      '- 2000, et viktig veiskille',
      '  - Delvis privatisert',
      '  - Notert på Oslo Børs',
      '- 1996-2017',
    ])
  })

  it('carries children when a parent moves', () => {
    expect(listOf(moveListItem(DECK, 2, 1)!)).toEqual([
      '- 1996-2017',
      '- 2000, et viktig veiskille',
      '  - Notert på Oslo Børs',
      '  - Delvis privatisert',
    ])
  })

  it('refuses when there is no sibling that way', () => {
    expect(moveListItem(DECK, 3, -1)).toBeNull()
    expect(moveListItem(DECK, 5, 1)).toBeNull()
  })
})
