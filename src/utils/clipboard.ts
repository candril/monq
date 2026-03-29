/**
 * Copy text to clipboard.
 * Uses pbcopy on macOS, xclip/xsel on Linux.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (process.platform === "darwin") {
    await Bun.$`printf ${text} | pbcopy`.quiet()
  } else {
    try {
      await Bun.$`printf ${text} | xclip -selection clipboard`.quiet()
    } catch {
      await Bun.$`printf ${text} | xsel --clipboard`.quiet()
    }
  }
}
