/**
 * Database and collection management actions.
 * Handles create and drop operations with confirmation dialogs.
 */

import type { Dispatch } from "react"
import type { AppAction } from "../state"

/**
 * Show create collection input dialog.
 * The dialog will call the provided handler when confirmed.
 */
export function promptCreateCollection(
  dispatch: Dispatch<AppAction>,
  onCreateCollection: (collectionName: string) => Promise<string | null>,
): void {
  dispatch({
    type: "SHOW_CREATE_INPUT",
    input: {
      resolve: async (name) => {
        if (!name) {
          return
        }
        const err = await onCreateCollection(name)
        if (err) {
          dispatch({ type: "SHOW_MESSAGE", message: err, kind: "error" })
        }
      },
    },
  })
}

/**
 * Show rename collection input dialog.
 * Pre-filled with the current name.
 */
export function promptRenameCollection(
  dispatch: Dispatch<AppAction>,
  oldName: string,
  onRenameCollection: (oldName: string, newName: string) => Promise<string | null>,
): void {
  dispatch({
    type: "SHOW_RENAME_INPUT",
    input: {
      type: "collection",
      oldName,
      resolve: async (newName) => {
        if (!newName) {
          return
        }
        const err = await onRenameCollection(oldName, newName)
        if (err) {
          dispatch({ type: "SHOW_MESSAGE", message: err, kind: "error" })
        }
      },
    },
  })
}

/**
 * Show drop collection confirmation dialog.
 * Requires typing the exact collection name to confirm.
 */
export function promptDropCollection(
  dispatch: Dispatch<AppAction>,
  collectionName: string,
  onDropCollection: (collectionName: string) => Promise<string | null>,
): void {
  dispatch({
    type: "SHOW_DROP_CONFIRM",
    confirmation: {
      type: "collection",
      name: collectionName,
      resolve: async (confirmed) => {
        if (!confirmed) {
          return
        }
        const err = await onDropCollection(collectionName)
        if (err) {
          dispatch({ type: "SHOW_MESSAGE", message: err, kind: "error" })
        }
      },
    },
  })
}

/**
 * Show drop database confirmation dialog.
 * Requires typing the exact database name to confirm.
 */
export function promptDropDatabase(
  dispatch: Dispatch<AppAction>,
  dbName: string,
  onDropDatabase: (dbName: string) => Promise<string | null>,
): void {
  dispatch({
    type: "SHOW_DROP_CONFIRM",
    confirmation: {
      type: "database",
      name: dbName,
      resolve: async (confirmed) => {
        if (!confirmed) {
          return
        }
        const err = await onDropDatabase(dbName)
        if (err) {
          dispatch({ type: "SHOW_MESSAGE", message: err, kind: "error" })
        }
      },
    },
  })
}
