/**
 * Main application component
 * Thin composition layer — logic lives in hooks, display in components.
 */

import { useReducer } from "react"
import { Shell } from "./components/Shell"
import { Header } from "./components/Header"
import { FilterBar } from "./components/FilterBar"
import { Loading } from "./components/Loading"
import { CollectionList } from "./components/CollectionList"
import { theme } from "./theme"
import { appReducer, createInitialState } from "./state"
import { useMongoConnection } from "./hooks/useMongoConnection"
import { useKeyboardNav } from "./hooks/useKeyboardNav"

interface AppProps {
  uri: string
}

export function App({ uri }: AppProps) {
  const [state, dispatch] = useReducer(appReducer, null, createInitialState)

  useMongoConnection({ uri, dispatch })
  useKeyboardNav({ state, dispatch })

  const headerRight = state.view === "collections"
    ? `${state.collections.length} collections`
    : `${state.documentCount.toLocaleString()} docs`

  return (
    <Shell>
      <Header
        dbName={state.dbName}
        host={state.host}
        loading={state.collectionsLoading || state.documentsLoading}
        right={headerRight}
      />

      <box flexGrow={1} overflow="hidden">
        {state.error ? (
          <box flexGrow={1} justifyContent="center" alignItems="center" flexDirection="column">
            <text>
              <span fg={theme.error}>Error: {state.error}</span>
            </text>
            <box marginTop={1}>
              <text>
                <span fg={theme.textDim}>Check your --uri and try again</span>
              </text>
            </box>
          </box>
        ) : state.collectionsLoading ? (
          <Loading message="Connecting to MongoDB..." />
        ) : state.view === "collections" ? (
          <CollectionList
            collections={state.collections}
            selectedIndex={state.collectionSelectedIndex}
          />
        ) : state.view === "documents" ? (
          <box flexGrow={1} justifyContent="center" alignItems="center">
            {state.documentsLoading ? (
              <Loading message="Loading documents..." />
            ) : (
              <text>
                <span fg={theme.textDim}>
                  {state.tabs.find((t) => t.id === state.activeTabId)?.collectionName ?? ""}
                  {" "}- {state.documentCount} documents
                </span>
              </text>
            )}
          </box>
        ) : null}
      </box>

      <FilterBar
        query={state.queryInput}
        mode={state.queryMode}
        editing={state.queryVisible}
      />
    </Shell>
  )
}
