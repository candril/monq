/**
 * WelcomeScreen — full-screen database picker shown at startup when no DB
 * is selected (URI didn't contain a `/db` segment).
 *
 * Once a database is picked, the sidebar takes over (spec 055): the
 * sidebar opens + focuses + auto-peeks the first collection. There is no
 * step 2 — collection browsing happens entirely through the sidebar and
 * the `Ctrl+P` palette from then on.
 *
 * Interaction model (palette-style, full-screen):
 *   - Type to fuzzy-filter the database list
 *   - ↑/↓, Ctrl-p/n, Ctrl-k/j → move selection
 *   - Enter → pick highlighted database
 *   - Tab → open inline "new database" input
 *   - Ctrl-D → drop selected database (with confirmation)
 *   - Backspace on empty → back to URI screen (when supported)
 *   - Esc → quit
 */

import { useState, useMemo } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { fuzzyFilter } from "../utils/fuzzy"
import { theme } from "../theme"
import { DropConfirmDialog } from "./DropConfirmDialog"

const MIN_LIST_HEIGHT = 10

interface WelcomeScreenProps {
  /** List of database names */
  databases: string[]
  /** MongoDB host (shown under the Monq brand) */
  host: string
  /** True while the database list is loading */
  databasesLoading: boolean
  /** Called when a database is picked */
  onSelectDatabase: (name: string) => void
  /** Called when Backspace on empty input → back to URI screen (optional) */
  onBackToUri?: () => void
  /** Called to create a new database; returns an error string or null on success */
  onCreateDatabase: (dbName: string, firstCollection: string) => Promise<string | null>
  /** Called to drop a database; returns an error string or null on success */
  onDropDatabase: (dbName: string) => Promise<string | null>
}

type CreateStep = "idle" | "name" | "first-collection" | "creating"

export function WelcomeScreen({
  databases,
  host,
  databasesLoading,
  onSelectDatabase,
  onBackToUri,
  onCreateDatabase,
  onDropDatabase,
}: WelcomeScreenProps) {
  const renderer = useRenderer()
  const [query, setQuery] = useState("")
  const [cursor, setCursor] = useState(0)

  // Create flow state
  const [createStep, setCreateStep] = useState<CreateStep>("idle")
  const [newName, setNewName] = useState("")
  const [firstCollection, setFirstCollection] = useState("")
  const [createError, setCreateError] = useState<string | null>(null)

  // Drop flow state
  const [showDropConfirm, setShowDropConfirm] = useState(false)
  const [dropTargetName, setDropTargetName] = useState("")

  const filtered = useMemo(
    () => (query ? fuzzyFilter(query, databases, (s) => [s]) : databases),
    [query, databases],
  )

  const safeCursor = Math.min(cursor, Math.max(0, filtered.length - 1))

  const isCreating = createStep !== "idle"
  const isLoading = databasesLoading
  const isEmpty = !isLoading && databases.length === 0

  useKeyboard((key) => {
    // Don't handle keys when the drop dialog is showing — let it handle input
    if (showDropConfirm) {
      return
    }

    // ── Create flow ──────────────────────────────────────────────────────────
    if (createStep === "name") {
      if (key.name === "escape" || (key.name === "backspace" && !newName)) {
        setCreateStep("idle")
        setNewName("")
        setCreateError(null)
        return
      }
      if (key.name === "return") {
        if (!newName.trim()) {
          return
        }
        // Database creation requires a first collection — go to step 2 of
        // the create flow.
        setCreateStep("first-collection")
        setFirstCollection("")
        setCreateError(null)
        return
      }
      // Let <input> handle text input; suppress other key handlers
      return
    }

    if (createStep === "first-collection") {
      if (key.name === "escape") {
        setCreateStep("name")
        setFirstCollection("")
        setCreateError(null)
        return
      }
      if (key.name === "return") {
        const col = firstCollection.trim() || "default"
        setCreateStep("creating")
        setCreateError(null)
        onCreateDatabase(newName.trim(), col).then((err) => {
          if (err) {
            setCreateStep("first-collection")
            setCreateError(err)
          } else {
            setCreateStep("idle")
            setNewName("")
            setFirstCollection("")
          }
        })
        return
      }
      return
    }

    if (createStep === "creating") {
      return
    }

    // ── Normal navigation ────────────────────────────────────────────────────
    // Move up
    if (key.name === "up" || (key.ctrl && key.name === "p") || (key.ctrl && key.name === "k")) {
      setCursor((c) => Math.max(0, c - 1))
      return
    }
    // Move down
    if (key.name === "down" || (key.ctrl && key.name === "n") || (key.ctrl && key.name === "j")) {
      setCursor((c) => Math.min(filtered.length - 1, c + 1))
      return
    }
    // Pick
    if (key.name === "return") {
      const item = filtered[safeCursor]
      if (item) {
        setQuery("")
        setCursor(0)
        onSelectDatabase(item)
      }
      return
    }
    // New database (Tab — Ctrl+I is the same byte in terminals)
    if (key.name === "tab") {
      setCreateStep("name")
      setNewName("")
      setCreateError(null)
      return
    }
    // Drop database (Ctrl-D)
    if (key.ctrl && key.name === "d") {
      const item = filtered[safeCursor]
      if (item && !isEmpty) {
        setDropTargetName(item)
        setShowDropConfirm(true)
      }
      return
    }
    // Backspace on empty → back to URI screen if supported
    if (key.name === "backspace" && !query && onBackToUri) {
      onBackToUri()
      return
    }
    // Quit
    if (key.name === "escape") {
      renderer.destroy()
    }
  })

  const stepTitle = isEmpty ? "No databases found" : "Select a database"

  const hintParts: string[] = []
  if (!isCreating) {
    if (!isLoading && !isEmpty) {
      hintParts.push("Ctrl-D  drop")
    }
    if (!isLoading) {
      hintParts.push("Tab  new")
    }
    if (onBackToUri) {
      hintParts.push("⌫  back")
    }
    hintParts.push("Esc  quit")
  }
  const hint = hintParts.join("  ·  ")

  return (
    <box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
      {/* Brand */}
      <box marginBottom={1} flexDirection="column" alignItems="center">
        <text>
          <span fg={theme.primary}>
            <strong>Monq</strong>
          </span>
        </text>
        <text>
          <span fg={theme.textDim}>{host}</span>
        </text>
      </box>

      {/* Step title */}
      <box marginBottom={1}>
        <text>
          <span fg={isEmpty ? theme.textMuted : theme.text}>{stepTitle}</span>
        </text>
      </box>

      {/* Create flow — inline input(s) */}
      {isCreating && (
        <box minWidth={36} flexDirection="column" marginBottom={2}>
          {createStep !== "first-collection" && (
            <>
              <text>
                <span fg={theme.textMuted}>New database name</span>
              </text>
              <box flexDirection="row" paddingLeft={1} marginTop={1}>
                <text>
                  <span fg={theme.primary}>{"> "}</span>
                </text>
                <input
                  value={newName}
                  onInput={(v) => {
                    setNewName(v)
                    setCreateError(null)
                  }}
                  focused={createStep === "name"}
                  backgroundColor={theme.bg}
                  textColor={theme.text}
                  cursorColor={theme.primary}
                  width={32}
                />
              </box>
            </>
          )}
          {createStep === "first-collection" && (
            <>
              <text>
                <span fg={theme.textMuted}>Database: </span>
                <span fg={theme.text}>{newName}</span>
              </text>
              <box marginTop={1}>
                <text>
                  <span fg={theme.textMuted}>{"First collection name (Enter for 'default')"}</span>
                </text>
              </box>
              <box flexDirection="row" paddingLeft={1} marginTop={1}>
                <text>
                  <span fg={theme.primary}>{"> "}</span>
                </text>
                <input
                  value={firstCollection}
                  onInput={(v) => {
                    setFirstCollection(v)
                    setCreateError(null)
                  }}
                  placeholder="default"
                  focused
                  backgroundColor={theme.bg}
                  textColor={theme.text}
                  placeholderColor={theme.textMuted}
                  cursorColor={theme.primary}
                  width={32}
                />
              </box>
            </>
          )}
          {createStep === "creating" && (
            <box marginTop={1}>
              <text>
                <span fg={theme.textMuted}>Creating...</span>
              </text>
            </box>
          )}
          {createError && (
            <box marginTop={1}>
              <text>
                <span fg={theme.error}>{createError}</span>
              </text>
            </box>
          )}
          <box marginTop={2}>
            <text>
              <span fg={theme.textMuted}>
                {createStep === "first-collection"
                  ? "Enter confirm  ·  Esc back"
                  : "Enter confirm  ·  Esc cancel"}
              </span>
            </text>
          </box>
        </box>
      )}

      {/* Search input — only shown when not in create flow and list is non-empty */}
      {!isCreating && !isEmpty && (
        <box minWidth={36} flexDirection="column" marginBottom={1}>
          <box>
            <text>
              <span fg={theme.textMuted}>{"─".repeat(36)}</span>
            </text>
          </box>
          <box flexDirection="row" paddingLeft={1} paddingRight={1}>
            <text>
              <span fg={theme.textDim}>{"> "}</span>
            </text>
            <input
              value={query}
              onInput={(v) => {
                setQuery(v)
                setCursor(0)
              }}
              placeholder="type to filter..."
              focused
              backgroundColor={theme.bg}
              textColor={theme.text}
              placeholderColor={theme.textMuted}
              cursorColor={theme.primary}
              width={32}
            />
          </box>
          <box>
            <text>
              <span fg={theme.textMuted}>{"─".repeat(36)}</span>
            </text>
          </box>
        </box>
      )}

      {/* Item list */}
      {!isCreating && (
        <box flexDirection="column" minWidth={36} minHeight={MIN_LIST_HEIGHT}>
          {isLoading ? (
            <box paddingLeft={2} paddingTop={1}>
              <text>
                <span fg={theme.textMuted}>Loading...</span>
              </text>
            </box>
          ) : isEmpty ? (
            <box paddingLeft={2} paddingTop={1}>
              <text>
                <span fg={theme.textMuted}>Press Tab to create one.</span>
              </text>
            </box>
          ) : filtered.length === 0 ? (
            <box paddingLeft={2} paddingTop={1}>
              <text>
                <span fg={theme.textMuted}>No matches</span>
              </text>
            </box>
          ) : (
            filtered.map((item, i) => {
              const isSelected = i === safeCursor
              return (
                <box
                  key={item}
                  flexDirection="row"
                  paddingLeft={2}
                  paddingRight={2}
                  backgroundColor={isSelected ? theme.selection : undefined}
                >
                  <text>
                    <span fg={isSelected ? theme.text : theme.textDim}>{item}</span>
                  </text>
                </box>
              )
            })
          )}
        </box>
      )}

      {/* Hint row */}
      {hint && (
        <box marginTop={1}>
          <text>
            <span fg={theme.textMuted}>{hint}</span>
          </text>
        </box>
      )}

      {/* Drop confirmation dialog */}
      {showDropConfirm && (
        <DropConfirmDialog
          type="database"
          name={dropTargetName}
          onConfirm={async () => {
            setShowDropConfirm(false)
            await onDropDatabase(dropTargetName)
            setDropTargetName("")
          }}
          onCancel={() => {
            setShowDropConfirm(false)
            setDropTargetName("")
          }}
        />
      )}
    </box>
  )
}
