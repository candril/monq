/**
 * Split cell text around search-term matches, for highlighting (spec 067).
 */

export interface TextPart {
  text: string
  match: boolean
}

/** One case-insensitive pattern for all terms, or null when there are none. */
export function searchHighlightPattern(terms: string[]): RegExp | null {
  const nonEmpty = terms.filter((term) => term.length > 0)
  if (nonEmpty.length === 0) {
    return null
  }
  // Longest first, so "new york" wins over "new" where both match
  const alternatives = [...nonEmpty]
    .sort((a, b) => b.length - a.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  return new RegExp(alternatives.join("|"), "gi")
}

export function splitMatches(text: string, pattern: RegExp | null): TextPart[] {
  if (!pattern) {
    return [{ text, match: false }]
  }
  const parts: TextPart[] = []
  let last = 0
  for (const m of text.matchAll(pattern)) {
    const start = m.index
    if (start > last) {
      parts.push({ text: text.slice(last, start), match: false })
    }
    parts.push({ text: m[0], match: true })
    last = start + m[0].length
  }
  if (last < text.length || parts.length === 0) {
    parts.push({ text: text.slice(last), match: false })
  }
  return parts
}
