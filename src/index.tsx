import { createCliRenderer, ConsolePosition, getTreeSitterClient } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { useState } from "react"
import { App } from "./App"
import { UriScreen } from "./components/UriScreen"
import { ConnectionScreen } from "./components/ConnectionScreen"
import { Shell } from "./components/Shell"
import { registerSyntaxParsers } from "./syntax-parsers"
import { stopWatching } from "./actions/pipelineWatch"
import { loadProfiles } from "./config/connections"
import type { ConnectionProfile } from "./config/connections"
import { registerSwitchConnection } from "./navigation"

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
//   monq                      (shows ConnectionScreen or URI input screen)
const args = process.argv.slice(2)
const uriIndex = args.indexOf("--uri")
const flagUri = uriIndex !== -1 ? (args[uriIndex + 1] ?? null) : null
const positionalUri =
  args.find((a) => a.startsWith("mongodb://") || a.startsWith("mongodb+srv://")) ?? null
const initialUri = flagUri ?? positionalUri

// Load saved connection profiles (empty array if no config file or no [connections] section)
const savedProfiles: ConnectionProfile[] = initialUri ? [] : await loadProfiles()

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

type Screen = "picker" | "app"

function initialScreen(): Screen {
  if (initialUri) return "app"
  return "picker"
}

/** Root: routes between picker (ConnectionScreen or UriScreen) and App */
function Root() {
  const [screen, setScreen] = useState<Screen>(initialScreen)
  const [uri, setUri] = useState<string | null>(initialUri)

  if (screen === "app" && uri) {
    return (
      <App
        uri={uri}
        onBackToUri={() => {
          setUri(null)
          setScreen("picker")
        }}
      />
    )
  }

  const handleConnect = (resolvedUri: string) => {
    setUri(resolvedUri)
    setScreen("app")
  }

  // Register the navigation callback so usePaletteActions can call it directly
  registerSwitchConnection(() => {
    setUri(null)
    setScreen("picker")
  })

  return (
    <Shell>
      {savedProfiles.length > 0 ? (
        <ConnectionScreen profiles={savedProfiles} onConnect={handleConnect} />
      ) : (
        <UriScreen onConnect={handleConnect} />
      )}
    </Shell>
  )
}

createRoot(renderer).render(<Root />)
