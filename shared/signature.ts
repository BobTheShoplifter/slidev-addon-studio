/**
 * A short fingerprint of an element's opening tag, used to tell otherwise
 * identical siblings apart.
 *
 * A grid of twelve `<Mascot />` elements is twelve tags with the same name. If
 * the only thing checked when confirming a source range were the tag name, a
 * stale line hint would happily verify against the wrong one and the editor
 * would write to a different element than the user clicked. Hashing the tag as
 * written makes that impossible without carrying the whole tag into the DOM.
 */
export function tagSignature(openingTag: string): string {
  const normalised = openingTag
    .replace(/\sdata-studio-[\w-]+="[^"]*"/g, '')
    // The two sides read the tag from different ends, so a self-closing slash
    // is present in one and not the other. Neither carries meaning here.
    .replace(/\/\s*>?\s*$/, '')
    .replace(/>\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()

  // FNV-1a, chosen for being four lines rather than for its cryptography.
  let hash = 0x811C9DC5
  for (let i = 0; i < normalised.length; i++) {
    hash ^= normalised.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36)
}
