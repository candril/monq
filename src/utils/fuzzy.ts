/**
 * Fuzzy matching utility for command palette filtering.
 */

/** Score a fuzzy match of query against text. Returns 0 for no match. */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase()
  const t = text.toLowerCase()

  // Exact substring at start — best
  if (t.startsWith(q)) {
    return 100 + q.length / t.length
  }

  // Exact substring anywhere
  if (t.includes(q)) {
    return 50 + q.length / t.length
  }

  // Fuzzy: all query chars appear in order
  let qi = 0
  let score = 0
  let lastMatch = -1

  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      score += i === lastMatch + 1 ? 2 : 1 // consecutive bonus
      lastMatch = i
      qi++
    }
  }

  return qi === q.length ? score : 0
}

/** Filter and sort items by fuzzy match against one or more fields. */
export function fuzzyFilter<T>(query: string, items: T[], getFields: (item: T) => string[]): T[] {
  if (!query) {
    return items
  }

  return items
    .map((item) => {
      const fields = getFields(item)
      const best = Math.max(...fields.map((f) => fuzzyScore(query, f)))
      return { item, score: best }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item)
}
