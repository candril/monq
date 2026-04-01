/**
 * Shared actions: bulk query update / delete flows.
 * Used by both useDocumentEditKeys (keyboard shortcut) and
 * usePaletteActions (command palette).
 *
 * Each function suspends the renderer, opens the editor,
 * handles the outcome, and dispatches the confirm dialog.
 */

import type { Dispatch } from "react"
import type { CliRenderer } from "@opentui/core"
import type { Filter, Document } from "mongodb"
import type { AppAction } from "../state"
import type { SchemaMap } from "../query/schema"
import {
  openEditorForQueryUpdate,
  openEditorForQueryDelete,
  type QueryUpdateReady,
} from "./queryUpdate"

export function runBulkQueryUpdate(
  collectionName: string,
  dbName: string,
  activeFilter: Filter<Document>,
  schemaMap: SchemaMap | undefined,
  dispatch: Dispatch<AppAction>,
  renderer: CliRenderer,
): void {
  renderer.suspend()
  openEditorForQueryUpdate(collectionName, dbName, activeFilter, schemaMap)
    .then((outcome) => {
      renderer.resume()
      if (outcome.cancelled) return
      if ("emptyUpdate" in outcome && outcome.emptyUpdate) {
        dispatch({
          type: "SHOW_MESSAGE",
          message: "Nothing to update — add fields to $set (or another operator)",
          kind: "info",
        })
        return
      }
      const { filter, update, upsert, matchedCount, apply, collectionName: resolvedCollection } =
        outcome as QueryUpdateReady
      dispatch({
        type: "SHOW_BULK_QUERY_UPDATE_CONFIRM",
        confirmation: {
          collectionName: resolvedCollection,
          filter,
          update,
          upsert,
          matchedCount,
          emptyFilter: Object.keys(filter).length === 0,
          resolve: async (confirmed) => {
            if (!confirmed) return
            try {
              const result = await apply()
              if (result.matchedCount === 0) {
                dispatch({ type: "SHOW_MESSAGE", message: "No documents matched", kind: "warning" })
              } else if (result.modifiedCount === 0 && result.upsertedCount === 0) {
                dispatch({
                  type: "SHOW_MESSAGE",
                  message: "No documents modified",
                  kind: "info",
                })
              } else {
                const parts: string[] = []
                if (result.modifiedCount > 0) parts.push(`Updated ${result.modifiedCount}`)
                if (result.upsertedCount > 0) parts.push(`Upserted ${result.upsertedCount}`)
                parts.push(`/ matched ${result.matchedCount}`)
                dispatch({ type: "SHOW_MESSAGE", message: parts.join(" "), kind: "success" })
              }
              dispatch({ type: "RELOAD_DOCUMENTS" })
            } catch (err) {
              dispatch({
                type: "SHOW_MESSAGE",
                message: `Update failed: ${(err as Error).message}`,
                kind: "error",
              })
            }
          },
        },
      })
    })
    .catch((err: Error) => {
      renderer.resume()
      dispatch({
        type: "SHOW_MESSAGE",
        message: `Bulk update failed: ${err.message}`,
        kind: "error",
      })
    })
}

export function runBulkQueryDelete(
  collectionName: string,
  dbName: string,
  activeFilter: Filter<Document>,
  schemaMap: SchemaMap | undefined,
  dispatch: Dispatch<AppAction>,
  renderer: CliRenderer,
): void {
  renderer.suspend()
  openEditorForQueryDelete(collectionName, dbName, activeFilter, schemaMap)
    .then((outcome) => {
      renderer.resume()
      if (outcome.cancelled) return
      const { filter, matchedCount, apply, collectionName: resolvedCollection } = outcome
      dispatch({
        type: "SHOW_BULK_QUERY_DELETE_CONFIRM",
        confirmation: {
          collectionName: resolvedCollection,
          filter,
          matchedCount,
          emptyFilter: Object.keys(filter).length === 0,
          resolve: async (confirmed) => {
            if (!confirmed) return
            try {
              const result = await apply()
              dispatch({
                type: "SHOW_MESSAGE",
                message: `Deleted ${result.deletedCount} document${result.deletedCount === 1 ? "" : "s"}`,
                kind: result.deletedCount > 0 ? "success" : "info",
              })
              dispatch({ type: "RELOAD_DOCUMENTS" })
            } catch (err) {
              dispatch({
                type: "SHOW_MESSAGE",
                message: `Delete failed: ${(err as Error).message}`,
                kind: "error",
              })
            }
          },
        },
      })
    })
    .catch((err: Error) => {
      renderer.resume()
      dispatch({
        type: "SHOW_MESSAGE",
        message: `Bulk delete failed: ${err.message}`,
        kind: "error",
      })
    })
}
