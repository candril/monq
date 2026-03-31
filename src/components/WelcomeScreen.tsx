/**
 * WelcomeScreen — inline DB and collection picker shown at startup.
 *
 * Two steps:
 *   Step 1: pick a database  (when dbName === "")
 *   Step 2: pick a collection (when dbName is set but no tab is open)
 *
 * Interaction model (palette-style, full-screen):
 *   - Type to fuzzy-filter the list
 *   - ↑/↓, Ctrl-p/n, Ctrl-k/j → move selection
 *   - Enter → pick highlighted item
 *   - n → open inline "new database" / "new collection" input
 *   - Backspace → delete last filter char; if empty and step 2 → go back
 *   - Esc / q (empty query) → quit
 */

import { useState, useMemo, useEffect } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { fuzzyFilter } from "../utils/fuzzy"
import { theme } from "../theme"
import { DropConfirmDialog } from "./DropConfirmDialog"

const MIN_LIST_HEIGHT = 10

interface WelcomeScreenProps {
  /** Step 1: list of database names */
  databases: string[]
  /** Step 2: list of collection names */
  collections: string[]
  /** Which step we're on */
  step: 1 | 2
  /** Currently selected database name (shown as breadcrumb in step 2) */
  dbName: string
  /** MongoDB host (shown under the Monq brand) */
  host: string
  /** True while step-1 database list is loading */
  databasesLoading: boolean
  /** True while step-2 collection list is loading */
  collectionsLoading: boolean
  /** Called when a database is picked */
  onSelectDatabase: (name: string) => void
  /** Called when a collection is picked */
  onSelectCollection: (name: string) => void
  /** Called when Backspace on empty input in step 2 → back to DB picker */
  onBack: () => void
  /** Called when Backspace on empty input in step 1 → back to URI screen (optional) */
  onBackToUri?: () => void
  /** Called to create a new database; returns an error string or null on success */
  onCreateDatabase: (dbName: string, firstCollection: string) => Promise<string | null>
  /** Called to create a new collection; returns an error string or null on success */
  onCreateCollection: (collectionName: string) => Promise<string | null>
  /** Called to drop a collection; returns an error string or null on success */
  onDropCollection: (collectionName: string) => Promise<string | null>
  /** Called to drop a database; returns an error string or null on success */
  onDropDatabase: (dbName: string) => Promise<string | null>
}

type CreateStep = "idle" | "name" | "first-collection" | "creating"

export function WelcomeScreen({
  databases,
  collections,
  step,
  dbName,
  host,
  databasesLoading,
  collectionsLoading,
  onSelectDatabase,
  onSelectCollection,
  onBack,
  onBackToUri,
  onCreateDatabase,
  onCreateCollection,
  onDropCollection,
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

  const items = step === 1 ? databases : collections
  const onSelect = step === 1 ? onSelectDatabase : onSelectCollection

  // Reset query + cursor + create flow when the step changes
  useEffect(() => {
    setQuery("")
    setCursor(0)
    setCreateStep("idle")
    setNewName("")
    setFirstCollection("")
    setCreateError(null)
  }, [step])

  const filtered = useMemo(
    () => (query ? fuzzyFilter(query, items, (s) => [s]) : items),
    [query, items],
  )

  const safeCursor = Math.min(cursor, Math.max(0, filtered.length - 1))

  const isCreating = createStep !== "idle"

  useKeyboard((key) => {
    // Don't handle keys when drop confirm is showing — let the dialog handle them
    if (showDropConfirm) return

    // ── Create flow ──────────────────────────────────────────────────────────
    if (createStep === "name") {
      if (key.name === "escape" || (key.name === "backspace" && !newName)) {
        setCreateStep("idle")
        setNewName("")
        setCreateError(null)
        return
      }
      if (key.name === "return") {
        if (!newName.trim()) return
        if (step === 1) {
          // Database: go to second prompt for first collection name
          setCreateStep("first-collection")
          setFirstCollection("")
          setCreateError(null)
        } else {
          // Collection: create immediately
          setCreateStep("creating")
          setCreateError(null)
          onCreateCollection(newName.trim()).then((err) => {
            if (err) {
              setCreateStep("name")
              setCreateError(err)
            } else {
              setCreateStep("idle")
              setNewName("")
            }
          })
        }
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

    if (createStep === "creating") return

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
        onSelect(item)
      }
      return
    }
    // New database / collection (Tab — Ctrl+I is the same byte in terminals)
    if (key.name === "tab") {
      setCreateStep("name")
      setNewName("")
      setCreateError(null)
      return
    }
    // Drop database / collection (Ctrl-D)
    if (key.ctrl && key.name === "d") {
      if (step === 1) {
        // Step 1: drop the selected database
        const item = filtered[safeCursor]
        if (item && !isEmpty) {
          setDropTargetName(item)
          setShowDropConfirm(true)
        }
      } else {
        // Step 2: if no collections, offer to drop the current database
        // otherwise drop the selected collection
        if (isEmpty || filtered.length === 0) {
          setDropTargetName(dbName)
          setShowDropConfirm(true)
        } else {
          const item = filtered[safeCursor]
          if (item) {
            setDropTargetName(item)
            setShowDropConfirm(true)
          }
        }
      }
      return
    }
    // Backspace on empty → go back one level
    if (key.name === "backspace" && !query) {
      if (step === 2) {
        onBack()
        return
      }
      if (step === 1 && onBackToUri) {
        onBackToUri()
        return
      }
      return
    }
    // Quit
    if (key.name === "escape") {
      renderer.destroy()
    }
  })

  const isLoading = step === 1 ? databasesLoading : collectionsLoading
  const isEmpty = !isLoading && items.length === 0

  const stepTitle =
    step === 1
      ? isEmpty
        ? "No databases found"
        : "Select a database"
      : isEmpty
        ? `${dbName}  ›  No collections`
        : `${dbName}  ›  Select a collection`

  const hintParts: string[] = []
  if (!isCreating) {
    // Show "Ctrl-D drop" when there are items to drop, OR on step 2 when empty (to drop the db)
    if (!isLoading && (!isEmpty || (step === 2 && isEmpty))) {
      hintParts.push(step === 2 && isEmpty ? "Ctrl-D  drop database" : "Ctrl-D  drop")
    }
    if (!isLoading) hintParts.push("Tab  new")
    if (step === 2 || onBackToUri) hintParts.push("⌫  back")
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
                <span fg={theme.textMuted}>
                  {step === 1 ? "New database name" : "New collection name"}
                </span>
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
          type={step === 1 || dropTargetName === dbName ? "database" : "collection"}
          name={dropTargetName}
          onConfirm={async () => {
            setShowDropConfirm(false)
            // If dropping current database (either from step 1 or step 2 when empty)
            if (step === 1 || dropTargetName === dbName) {
              await onDropDatabase(dropTargetName)
            } else {
              await onDropCollection(dropTargetName)
            }
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
