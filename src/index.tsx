import { createCliRenderer, ConsolePosition, getTreeSitterClient } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./App"
import { registerSyntaxParsers } from "./syntax-parsers"

// Register tree-sitter parsers (JSON for document preview)
registerSyntaxParsers()
const tsClient = getTreeSitterClient()
await tsClient.initialize()

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  useConsole: true,
  consoleOptions: {
    position: ConsolePosition.BOTTOM,
    sizePercent: 30,
    title: "monq console",
  },
})

// Parse --uri from argv
const args = process.argv.slice(2)
const uriIndex = args.indexOf("--uri")
const uri = uriIndex !== -1 ? args[uriIndex + 1] : null

if (!uri) {
  await renderer.destroy()
  console.error("Usage: monq --uri <mongodb-uri>")
  process.exit(1)
}

createRoot(renderer).render(<App uri={uri} />)
