/**
 * Hook: MongoDB connection lifecycle
 * Parses URI for display, initializes client, loads collections.
 */

import { useEffect } from "react"
import type { Dispatch } from "react"
import type { AppAction } from "../state"
import { parseUri, init, listCollections } from "../providers/mongodb"

interface UseMongoConnectionOptions {
  uri: string
  dispatch: Dispatch<AppAction>
}

export function useMongoConnection({ uri, dispatch }: UseMongoConnectionOptions) {
  // Parse URI immediately for header display
  useEffect(() => {
    const { host, dbName } = parseUri(uri)
    dispatch({ type: "SET_CONNECTION_INFO", dbName, host })
  }, [uri])

  // Init client and load collections (actual connection is lazy)
  useEffect(() => {
    let cancelled = false
    init(uri)

    listCollections()
      .then((collections) => {
        if (!cancelled) dispatch({ type: "SET_COLLECTIONS", collections })
      })
      .catch((err: Error) => {
        if (!cancelled) dispatch({ type: "SET_ERROR", error: err.message })
      })

    return () => { cancelled = true }
  }, [uri])
}
