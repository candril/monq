/**
 * Hook: MongoDB connection lifecycle
 * Parses URI for display, initializes client, loads collections.
 * If the URI has no database, opens the db picker first.
 */

import { useEffect, useRef } from "react"
import type { Dispatch } from "react"
import type { AppAction } from "../state"
import {
  parseUri,
  init,
  listCollections,
  listDatabases,
  switchDatabase,
} from "../providers/mongodb"

interface UseMongoConnectionOptions {
  uri: string
  dispatch: Dispatch<AppAction>
  dbName: string
}

export function useMongoConnection({ uri, dispatch, dbName }: UseMongoConnectionOptions) {
  // Track whether the initial setup has run and whether the initial db came from the URI
  const didInitRef = useRef(false)
  const uriHadDbRef = useRef(false)

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
      listDatabases()
        .then((databases) => {
          if (cancelled) return
          dispatch({ type: "SET_DATABASES", databases })
          dispatch({ type: "OPEN_DB_PICKER" })
        })
        .catch((err: Error) => {
          if (!cancelled)
            dispatch({ type: "SET_ERROR", error: `Failed to list databases: ${err.message}` })
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
  }, [dbName])
}
