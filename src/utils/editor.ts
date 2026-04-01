/**
 * Shared editor utilities used by actions that open $EDITOR.
 */

/** Resolve the user's preferred editor from environment */
export function getEditor(): string {
  return process.env.EDITOR || process.env.VISUAL || "vi"
}

/** Matches an injected parse-error comment block at the top of a file */
export const ERROR_COMMENT_RE = /^(\/\/ !! .*\n(\/\/.*\n)*\n?)/m

/** Remove full-line comments (// ...) only — preserve inline strings */
export function stripComments(content: string): string {
  return content.replace(/^\/\/.*$/gm, "").trim()
}

/** Remove an injected parse-error comment block from the top of a file */
export function stripErrorComment(content: string): string {
  return content.replace(ERROR_COMMENT_RE, "")
}
