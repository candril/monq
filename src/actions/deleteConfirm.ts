/**
 * Shared action: show delete-document confirmation dialog.
 * Used by both useDocumentEditKeys (keyboard shortcut) and
 * usePaletteActions (command palette) to avoid duplicating
 * the resolve callback and dispatch sequence.
 */

import type { Dispatch } from "react"
import type { Document } from "mongodb"
import type { AppAction } from "../state"
import { deleteDocument } from "../providers/mongodb"

export function showDeleteConfirm(
  collectionName: string,
  docs: Document[],
  dispatch: Dispatch<AppAction>,
): void {
  dispatch({
    type: "SHOW_DELETE_CONFIRM",
    confirmation: {
      docs,
      resolve: async (confirmed) => {
        if (!confirmed) {
          return
        }
        const errors: string[] = []
        for (const doc of docs) {
          try {
            await deleteDocument(collectionName, doc._id)
          } catch (err) {
            errors.push(`Delete failed: ${(err as Error).message}`)
          }
        }
        if (errors.length > 0) {
          dispatch({ type: "SHOW_MESSAGE", message: errors[0], kind: "error" })
        } else {
          const n = docs.length
          dispatch({
            type: "SHOW_MESSAGE",
            message: `Deleted ${n} document${n === 1 ? "" : "s"}`,
            kind: "success",
          })
          dispatch({ type: "EXIT_SELECTION_MODE" })
        }
        dispatch({ type: "RELOAD_DOCUMENTS" })
      },
    },
  })
}
