import { describe, expect, it } from 'vitest'
import { tagSignature } from '../shared/signature'

describe('tagSignature', () => {
  it('reads the same tag identically from either side', () => {
    // The annotator sees the tag up to its attributes; the client re-reads it
    // from the Markdown, including the closing slash.
    expect(tagSignature('<Mascot name="shield-1" :size="110" '))
      .toBe(tagSignature('<Mascot name="shield-1" :size="110" /'))
    expect(tagSignature('<Sticker :rotate="-3"'))
      .toBe(tagSignature('<Sticker :rotate="-3">'))
  })

  it('tells identical siblings apart', () => {
    expect(tagSignature('<Mascot name="shield-1" />'))
      .not.toBe(tagSignature('<Mascot name="lock-1" />'))
  })

  it('ignores its own annotations, so a re-read still matches', () => {
    expect(tagSignature('<Mascot data-studio-src="3,4" name="shield-1"'))
      .toBe(tagSignature('<Mascot name="shield-1"'))
  })

  it('ignores whitespace differences', () => {
    expect(tagSignature('<Pill  color="red" ')).toBe(tagSignature('<Pill color="red"'))
  })
})
