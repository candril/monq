import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./App"

// Parse CLI arguments
const args = process.argv.slice(2)
const uriIndex = args.indexOf("--uri")
const uri = uriIndex !== -1 ? args[uriIndex + 1] : null

if (!uri) {
  console.error("Usage: monq --uri <mongodb-uri>")
  console.error("")
  console.error("Examples:")
  console.error("  monq --uri mongodb://localhost:27017/mydb")
  console.error('  monq --uri "mongodb+srv://user:pass@cluster.mongodb.net/mydb"')
  process.exit(1)
}

// Create renderer and mount app
const renderer = await createCliRenderer({
  exitOnCtrlC: false,
})

createRoot(renderer).render(<App uri={uri} />)
