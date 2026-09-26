/** Tokenize query string, respecting quoted values */
export function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ""
  let inQuote: string | null = null

  for (const ch of input) {
    if (inQuote) {
      current += ch
      if (ch === inQuote) {
        inQuote = null
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch
      current += ch
    } else if (ch === " ") {
      if (current) {
        tokens.push(current)
      }
      current = ""
    } else {
      current += ch
    }
  }
  if (current) {
    tokens.push(current)
  }
  return tokens
}
