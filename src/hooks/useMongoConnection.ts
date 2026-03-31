/**
 * Hook: MongoDB connection lifecycle
 * Parses URI for display, initializes client, loads collections.
 * If the URI has no database, opens the db picker first.
 * Also handles CREATE_DATABASE and CREATE_COLLECTION actions.
 */

import { useEffect, useRef } from "react"
import type { Dispatch } from "react"
import type { AppAction } from "../state"
import type { AppState } from "../types"
import {
  parseUri,
  init,
  listCollections,
  listDatabases,
  switchDatabase,
  createCollection,
  createDatabase,
  dropCollection,
  dropDatabase,
} from "../providers/mongodb"

interface UseMongoConnectionOptions {
  uri: string
  dispatch: Dispatch<AppAction>
  dbName: string
  state: AppState
}

export function useMongoConnection({ uri, dispatch, dbName, state }: UseMongoConnectionOptions) {
  // Track whether the initial setup has run and whether the initial db came from the URI
  const didInitRef = useRef(false)
  const uriHadDbRef = useRef(false)
  // Skip the next dbName effect when we've already handled the DB switch ourselves
  const skipNextDbEffectRef = useRef(false)

  // Initialize client and kick off the first load once (on mount / uri change)
  useEffect(() => {
    const { host, dbName: uriDbName } = parseUri(uri)
    dispatch({ type: "SET_CONNECTION_INFO", dbName: uriDbName, host })
    init(uri, uriDbName || undefined)
    uriHadDbRef.current = !!uriDbName
    didInitRef.current = true

    let cancelled = false

    if (!uriDbName) {
      // No db in URI — list databases so user can pick one
      dispatch({ type: "SET_DATABASES_LOADING", loading: true })
      listDatabases()
        .then((databases) => {
          if (cancelled) return
          dispatch({ type: "SET_DATABASES", databases })
          dispatch({ type: "OPEN_DB_PICKER" })
        })
        .catch((err: Error) => {
          if (!cancelled) {
            dispatch({ type: "SET_DATABASES_LOADING", loading: false })
            dispatch({ type: "SET_ERROR", error: `Failed to list databases: ${err.message}` })
          }
        })
    } else {
      // db is in URI — load collections right away
      listCollections()
        .then((collections) => {
          if (!cancelled) dispatch({ type: "SET_COLLECTIONS", collections })
        })
        .catch((err: Error) => {
          if (!cancelled) dispatch({ type: "SET_ERROR", error: err.message })
        })
    }

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dispatch is stable, uri is the only meaningful trigger
  }, [uri])

  // Reload collections when the user switches to a different database
  useEffect(() => {
    // Skip the initial render / URI-driven value (handled above)
    if (!didInitRef.current) return
    if (!dbName) return
    // If the URI already had a db, the first run of this effect is the initial
    // value set by SET_CONNECTION_INFO — skip it to avoid double-loading.
    if (uriHadDbRef.current) {
      uriHadDbRef.current = false
      return
    }
    if (skipNextDbEffectRef.current) {
      skipNextDbEffectRef.current = false
      return
    }

    switchDatabase(dbName)
    let cancelled = false
    listCollections()
      .then((collections) => {
        if (!cancelled) dispatch({ type: "SET_COLLECTIONS", collections })
      })
      .catch((err: Error) => {
        if (!cancelled) dispatch({ type: "SET_ERROR", error: err.message })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dispatch is stable, dbName is the only meaningful trigger
  }, [dbName])

  // Handle CREATE_COLLECTION — called imperatively from WelcomeScreen via dispatch
  // We expose this as a callable function returned from the hook
  async function handleCreateCollection(collectionName: string): Promise<string | null> {
    try {
      await createCollection(collectionName)
      const collections = await listCollections()
      dispatch({ type: "SET_COLLECTIONS", collections })
      dispatch({ type: "OPEN_TAB", collectionName })
      return null
    } catch (err) {
      return (err as Error).message
    }
  }

  async function handleCreateDatabase(
    newDbName: string,
    firstCollection: string,
  ): Promise<string | null> {
    try {
      await createDatabase(newDbName, firstCollection)
      switchDatabase(newDbName)
      const collections = await listCollections()
      skipNextDbEffectRef.current = true
      // SELECT_DATABASE clears all old tabs, then we open the new collection
      dispatch({ type: "SELECT_DATABASE", dbName: newDbName })
      dispatch({ type: "SET_COLLECTIONS", collections })
      dispatch({ type: "OPEN_TAB", collectionName: firstCollection })
      return null
    } catch (err) {
      return (err as Error).message
    }
  }

  async function handleDropCollection(collectionName: string): Promise<string | null> {
    try {
      await dropCollection(collectionName)
      const collections = await listCollections()
      dispatch({ type: "SET_COLLECTIONS", collections })
      // Close any tabs for this collection
      const tabsToClose = state.tabs.filter((t) => t.collectionName === collectionName)
      for (const tab of tabsToClose) {
        dispatch({ type: "CLOSE_TAB", tabId: tab.id })
      }
      dispatch({
        type: "SHOW_MESSAGE",
        message: `Dropped collection: ${collectionName}`,
        kind: "success",
      })
      return null
    } catch (err) {
      return (err as Error).message
    }
  }

  async function handleDropDatabase(targetDbName: string): Promise<string | null> {
    try {
      await dropDatabase(targetDbName)
      // Always reload the database list
      const databases = await listDatabases()
      dispatch({ type: "SET_DATABASES", databases })

      // If we dropped the active database, go back to step 1 (database picker)
      if (targetDbName === dbName) {
        dispatch({ type: "RESET_DATABASE" })
      }

      dispatch({
        type: "SHOW_MESSAGE",
        message: `Dropped database: ${targetDbName}`,
        kind: "success",
      })
      return null
    } catch (err) {
      return (err as Error).message
    }
  }

  return { handleCreateCollection, handleCreateDatabase, handleDropCollection, handleDropDatabase }
}
