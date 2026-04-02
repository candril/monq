/** Palette handlers: view commands (preview, explain, indexes, column mode, filter bar) */

import type { PaletteContext } from "./types"
import { resolveCurrentQuery } from "../../utils/query"
import { openExplainInEditor } from "../explain"
import { openEditorForIndexes } from "../index"
import { filterBySelectedValue } from "../filterValue"
import { explainFind, explainAggregate } from "../../providers/mongodb"
import { editDocument } from "../edit"
import { serializeDocument } from "../../utils/document"
import { getNestedValue } from "../../utils/format"
import { copyToClipboard } from "../../utils/clipboard"
import { parseSimpleQueryFull, projectionToSimple } from "../../query/parser"

export function handleViewCommand(cmdId: string, ctx: PaletteContext): boolean {
  const { state, dispatch, renderer } = ctx

  switch (cmdId) {
    case "doc:edit": {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      const doc = state.documents[state.selectedIndex]
      const tab = state.tabs.find((t) => t.id === state.activeTabId)
      if (doc && tab) {
        renderer.suspend()
        editDocument(tab.collectionName, state.dbName, doc, state.schemaMap).finally(() => {
          renderer.resume()
          dispatch({ type: "RELOAD_DOCUMENTS" })
        })
      }
      return true
    }
    case "doc:copy-json": {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      const doc = state.documents[state.selectedIndex]
      if (doc) {
        copyToClipboard(serializeDocument(doc)).catch(() => {})
        dispatch({ type: "SHOW_MESSAGE", message: "Copied to clipboard", kind: "info" })
      }
      return true
    }
    case "doc:copy-id": {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      const doc = state.documents[state.selectedIndex]
      if (doc?._id) {
        copyToClipboard(String(doc._id)).catch(() => {})
        dispatch({ type: "SHOW_MESSAGE", message: "Copied _id", kind: "info" })
      }
      return true
    }
    case "doc:copy-cell": {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      const doc = state.documents[state.selectedIndex]
      if (!doc) {
        return true
      }
      const visCols = state.columns.filter((c) => c.visible)
      const col = visCols[state.selectedColumnIndex]
      if (!col) {
        return true
      }
      const val = getNestedValue(doc as Record<string, unknown>, col.field)
      const text =
        val === undefined || val === null
          ? ""
          : typeof val === "object" && "toHexString" in val
            ? (val as { toHexString(): string }).toHexString()
            : typeof val === "object"
              ? JSON.stringify(val, null, 2)
              : String(val)
      copyToClipboard(text).catch(() => {})
      dispatch({ type: "SHOW_MESSAGE", message: `Copied ${col.field} to clipboard`, kind: "info" })
      return true
    }
    case "doc:filter-value":
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      filterBySelectedValue(state, dispatch)
      return true

    case "view:toggle-preview":
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      dispatch({ type: "TOGGLE_PREVIEW" })
      return true
    case "view:cycle-preview":
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      dispatch({ type: "CYCLE_PREVIEW_POSITION" })
      return true
    case "view:explain": {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) {
        return true
      }
      if (state.previewPosition && state.previewMode === "explain") {
        dispatch({ type: "TOGGLE_PREVIEW" })
        return true
      }
      if (!state.previewPosition) {
        dispatch({ type: "TOGGLE_PREVIEW" })
      }
      dispatch({ type: "SET_PREVIEW_MODE", mode: "explain" })
      dispatch({ type: "SET_EXPLAIN_LOADING", loading: true })
      const query = resolveCurrentQuery(state)
      const explainPromise =
        query.mode === "aggregate"
          ? explainAggregate(activeTab.collectionName, query.pipeline)
          : explainFind(activeTab.collectionName, query.filter, {
              sort: query.sort,
              projection: query.projection,
            })
      explainPromise
        .then(({ result, limited }) => {
          dispatch({ type: "SET_EXPLAIN_RESULT", result, limited })
        })
        .catch((err: Error) => {
          dispatch({ type: "SET_EXPLAIN_LOADING", loading: false })
          dispatch({
            type: "SHOW_MESSAGE",
            message: `Explain failed: ${err.message}`,
            kind: "error",
          })
          dispatch({ type: "SET_PREVIEW_MODE", mode: "document" })
        })
      return true
    }
    case "view:explain-raw": {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) {
        return true
      }
      const rawQuery = resolveCurrentQuery(state)
      renderer.suspend()
      const rawPromise =
        rawQuery.mode === "aggregate"
          ? explainAggregate(activeTab.collectionName, rawQuery.pipeline)
          : explainFind(activeTab.collectionName, rawQuery.filter, {
              sort: rawQuery.sort,
              projection: rawQuery.projection,
            })
      rawPromise
        .then(({ result }) => openExplainInEditor(activeTab.collectionName, result))
        .then(() => renderer.resume())
        .catch((err: Error) => {
          renderer.resume()
          dispatch({
            type: "SHOW_MESSAGE",
            message: `Explain failed: ${err.message}`,
            kind: "error",
          })
        })
      return true
    }
    case "view:manage-indexes": {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) {
        return true
      }
      renderer.suspend()
      openEditorForIndexes(activeTab.collectionName, state.dbName, state.schemaMap)
        .then((outcome) => {
          renderer.resume()
          if (outcome.cancelled) {
            return
          }
          const { toCreate, toDrop, toReplace, apply } = outcome
          dispatch({
            type: "SHOW_INDEX_CREATE_CONFIRM",
            confirmation: {
              toCreate,
              toDrop,
              toReplace,
              resolve: async (confirmed) => {
                if (!confirmed) {
                  return
                }
                dispatch({
                  type: "SHOW_MESSAGE",
                  message: "Applying index changes...",
                  kind: "info",
                })
                const result = await apply()
                if (result.errors.length > 0) {
                  dispatch({ type: "SHOW_MESSAGE", message: result.errors[0], kind: "error" })
                } else {
                  const parts: string[] = []
                  if (result.created > 0) {
                    parts.push(`Created ${result.created}`)
                  }
                  if (result.dropped > 0) {
                    parts.push(`Dropped ${result.dropped}`)
                  }
                  dispatch({
                    type: "SHOW_MESSAGE",
                    message: parts.join(", ") || "No changes",
                    kind: "success",
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
            message: `Index editor failed: ${err.message}`,
            kind: "error",
          })
        })
      return true
    }
    case "view:toggle-filter-bar":
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      dispatch({ type: "TOGGLE_FILTER_BAR" })
      return true
    case "view:reload":
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      dispatch({ type: "RELOAD_DOCUMENTS" })
      return true
    case "view:cycle-column-mode":
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      dispatch({ type: "CYCLE_COLUMN_MODE" })
      return true
    case "view:toggle-column-exclude": {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      const visCols = state.columns.filter((c) => c.visible)
      const col = visCols[state.selectedColumnIndex]
      if (!col) {
        return true
      }
      const { projection: projObj } = parseSimpleQueryFull(state.queryInput)
      const proj: Record<string, 0 | 1> = { ...(projObj ?? {}) }
      if (proj[col.field] === 0) {
        delete proj[col.field]
      } else {
        delete proj[col.field]
        proj[col.field] = 0
      }
      const nonProjTokens = state.queryInput
        .trim()
        .split(/\s+/)
        .filter((t: string) => {
          if (!t) {
            return false
          }
          if (t.startsWith("+")) {
            return false
          }
          if (t.startsWith("-") && !/[><!:]/.test(t.slice(1))) {
            return false
          }
          return true
        })
      const projStr = Object.keys(proj).length > 0 ? " " + projectionToSimple(proj) : ""
      dispatch({ type: "SET_QUERY_INPUT", input: (nonProjTokens.join(" ") + projStr).trim() })
      dispatch({ type: "SUBMIT_QUERY" })
      return true
    }
    default:
      return false
  }
}
