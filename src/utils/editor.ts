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

/**
 * Inject a parse-error comment into a file and re-open the editor.
 * Returns the edited content, or null if the user quit or the file couldn't be read.
 */
export async function openEditorWithError(
  tmpFile: string,
  content: string,
  errorMsg: string,
): Promise<string | null> {
  const errorComment = `// !! PARSE ERROR: ${errorMsg}\n// Fix the JSON below and save, or delete all content to cancel.\n\n`
  await Bun.write(tmpFile, errorComment + stripErrorComment(content))
  const editor = getEditor()
  const proc = Bun.spawn([editor, tmpFile], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  await proc.exited
  if (proc.exitCode !== 0) {
    return null
  }
  try {
    return await Bun.file(tmpFile).text()
  } catch {
    return null
  }
}
