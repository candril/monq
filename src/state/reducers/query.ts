/** Reducer: query input, BSON mode, submit, clear, history */

import type { AppState, BsonSection } from "../../types"
import type { AppAction } from "../../state"
import { simpleToBson, bsonToSimple } from "../../query/parser"

export function queryReducer(state: AppState, action: AppAction): AppState | null {
  switch (action.type) {
    case "OPEN_QUERY": {
      const queryWithSpace =
        state.queryMode === "simple" && state.queryInput && !state.queryInput.endsWith(" ")
          ? state.queryInput + " "
          : state.queryInput
      return { ...state, queryVisible: true, queryInput: queryWithSpace }
    }

    case "OPEN_QUERY_BSON": {
      if (state.queryMode === "bson") {
        return { ...state, queryVisible: true }
      }
      const { bsonFilter, bsonSort, bsonProjection } = simpleToBson(
        state.queryInput,
        state.schemaMap,
        state.sortField,
        state.sortDirection,
        state.bsonSort,
        state.bsonProjection,
      )
      return {
        ...state,
        queryVisible: true,
        queryMode: "bson",
        queryInput: bsonFilter,
        bsonSort,
        bsonProjection,
        bsonSortVisible: bsonSort !== "",
        bsonProjectionVisible: bsonProjection !== "",
        bsonFocusedSection: "filter",
        sortField: null,
        sortDirection: -1,
        bsonExternalVersion: state.bsonExternalVersion + 1,
      }
    }

    case "CLOSE_QUERY":
      return { ...state, queryVisible: false, historyPickerOpen: false }

    case "SET_QUERY_INPUT":
      return { ...state, queryInput: action.input }

    case "SET_QUERY_MODE":
      return { ...state, queryMode: action.mode }

    case "TOGGLE_QUERY_MODE": {
      if (state.queryMode === "simple") {
        const { bsonFilter, bsonSort, bsonProjection } = simpleToBson(
          state.queryInput,
          state.schemaMap,
          state.sortField,
          state.sortDirection,
          state.bsonSort,
          state.bsonProjection,
        )
        return {
          ...state,
          queryMode: "bson",
          queryInput: bsonFilter,
          bsonSort,
          bsonProjection,
          bsonSortVisible: bsonSort !== "",
          bsonProjectionVisible: bsonProjection !== "",
          bsonFocusedSection: "filter",
          sortField: null,
          sortDirection: -1,
          bsonExternalVersion: state.bsonExternalVersion + 1,
        }
      } else {
        return {
          ...state,
          queryMode: "simple",
          queryInput: bsonToSimple(state.queryInput, state.bsonProjection),
          bsonFocusedSection: "filter",
        }
      }
    }

    case "SET_BSON_SORT":
      return { ...state, bsonSort: action.input }

    case "SET_BSON_PROJECTION":
      return { ...state, bsonProjection: action.input }

    case "SET_BSON_SECTION":
      return { ...state, bsonFocusedSection: action.section }

    case "CYCLE_BSON_SECTION": {
      const sections: BsonSection[] = ["filter"]
      if (state.bsonSortVisible) {
        sections.push("sort")
      }
      if (state.bsonProjectionVisible) {
        sections.push("projection")
      }
      const currentIdx = sections.indexOf(state.bsonFocusedSection)
      const nextIdx = (currentIdx + 1) % sections.length
      return { ...state, bsonFocusedSection: sections[nextIdx] }
    }

    case "TOGGLE_BSON_SORT": {
      const nowVisible = !state.bsonSortVisible
      return {
        ...state,
        bsonSortVisible: nowVisible,
        bsonFocusedSection: nowVisible ? "sort" : "filter",
        bsonSort: nowVisible ? state.bsonSort : "",
      }
    }

    case "TOGGLE_BSON_PROJECTION": {
      const nowVisible = !state.bsonProjectionVisible
      return {
        ...state,
        bsonProjectionVisible: nowVisible,
        bsonFocusedSection: nowVisible ? "projection" : "filter",
        bsonProjection: nowVisible ? state.bsonProjection : "",
      }
    }

    case "FORMAT_BSON_SECTION": {
      const section = state.bsonFocusedSection
      const raw =
        section === "filter"
          ? state.queryInput
          : section === "sort"
            ? state.bsonSort
            : state.bsonProjection
      let formatted = raw
      try {
        formatted = JSON.stringify(JSON.parse(raw.trim()), null, 2)
      } catch {
        // Not valid JSON yet — leave as-is
      }
      const ver = state.bsonExternalVersion + 1
      if (section === "filter") {
        return { ...state, queryInput: formatted, bsonExternalVersion: ver }
      }
      if (section === "sort") {
        return { ...state, bsonSort: formatted, bsonExternalVersion: ver }
      }
      return { ...state, bsonProjection: formatted, bsonExternalVersion: ver }
    }

    case "SUBMIT_QUERY":
      return {
        ...state,
        queryVisible: false,
        documentsLoading: true,
        reloadCounter: state.reloadCounter + 1,
        selectedIndex: 0,
        documents: [],
        loadedCount: 0,
        loadingMore: false,
        tabs: state.tabs.map((t) =>
          t.id === state.activeTabId
            ? { ...t, query: state.queryInput, queryMode: state.queryMode }
            : t,
        ),
      }

    case "CLEAR_QUERY":
      return {
        ...state,
        queryInput: "",
        queryVisible: false,
        documentsLoading: true,
        reloadCounter: state.reloadCounter + 1,
        selectedIndex: 0,
        documents: [],
        loadedCount: 0,
        loadingMore: false,
        tabs: state.tabs.map((t) => (t.id === state.activeTabId ? { ...t, query: "" } : t)),
      }

    case "LOAD_HISTORY":
      return { ...state, historyEntries: action.entries }

    case "APPEND_HISTORY_ENTRY": {
      const deduped = state.historyEntries.filter((e) => e !== action.entry)
      const entries = [action.entry, ...deduped].slice(0, 100)
      return { ...state, historyEntries: entries }
    }

    case "OPEN_HISTORY_PICKER":
      return { ...state, historyPickerOpen: true }

    case "CLOSE_HISTORY_PICKER":
      return { ...state, historyPickerOpen: false }

    default:
      return null
  }
}
