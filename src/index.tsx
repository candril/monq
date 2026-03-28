import { createCliRenderer, ConsolePosition, getTreeSitterClient } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./App"
import { registerSyntaxParsers } from "./syntax-parsers"
import { stopWatching } from "./actions/pipelineWatch"

// Stop file watcher on exit (covers Ctrl+C, SIGTERM, etc.)
process.on("exit", () => stopWatching())
process.on("SIGINT", () => { stopWatching(); process.exit(0) })
process.on("SIGTERM", () => { stopWatching(); process.exit(0) })

// Parse --uri from argv (before starting the renderer)
const args = process.argv.slice(2)
const uriIndex = args.indexOf("--uri")
const uri = uriIndex !== -1 ? args[uriIndex + 1] : null

if (!uri) {
  console.error("error: --uri is required\n")
  console.error("Usage:")
  console.error("  monq --uri <mongodb-uri>\n")
  console.error("Options:")
  console.error("  --uri <uri>   MongoDB connection URI (required)\n")
  console.error("Examples:")
  console.error("  monq --uri mongodb://localhost:27017")
  console.error("  monq --uri mongodb+srv://user:pass@cluster.mongodb.net/mydb")
  process.exit(1)
}

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

createRoot(renderer).render(<App uri={uri} />)
