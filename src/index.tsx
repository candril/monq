import { createCliRenderer, ConsolePosition, getTreeSitterClient } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { useState } from "react"
import { useRenderer } from "@opentui/react"
import { App } from "./App"
import { UriScreen } from "./components/UriScreen"
import { Shell } from "./components/Shell"
import { registerSyntaxParsers } from "./syntax-parsers"
import { stopWatching } from "./actions/pipelineWatch"

// Stop file watcher on exit (covers Ctrl+C, SIGTERM, etc.)
process.on("exit", () => stopWatching())
process.on("SIGINT", () => {
  stopWatching()
  process.exit(0)
})
process.on("SIGTERM", () => {
  stopWatching()
  process.exit(0)
})

// Parse URI from argv — supports:
//   monq --uri mongodb://...
//   monq mongodb://...        (bare positional)
//   monq                      (shows URI input screen)
const args = process.argv.slice(2)
const uriIndex = args.indexOf("--uri")
const flagUri = uriIndex !== -1 ? (args[uriIndex + 1] ?? null) : null
const positionalUri = args.find((a) => a.startsWith("mongodb://") || a.startsWith("mongodb+srv://")) ?? null
const initialUri = flagUri ?? positionalUri

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

/** Root: shows URI input screen if no --uri was given, then mounts App */
function Root() {
  const [uri, setUri] = useState<string | null>(initialUri)

  if (!uri) {
    return (
      <Shell>
        <UriScreen onConnect={setUri} />
      </Shell>
    )
  }

  return <App uri={uri} />
}

createRoot(renderer).render(<Root />)
