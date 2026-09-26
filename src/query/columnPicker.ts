/**
 * Column picker model (spec 068): which paths it lists, what starts checked,
 * and how a checked set turns back into projection tokens. Pure — the
 * component owns the cursor and filter, this owns the rules.
 */

import type { FieldInfo, SchemaMap } from "./schema"
import { isInclusion, type Projection } from "./projection"

export interface PickerRow {
  path: string
  depth: number
  type: string
}

function parentOf(path: string): string {
  const dot = path.lastIndexOf(".")
  return dot === -1 ? "" : path.slice(0, dot)
}

function typeLabel(info: FieldInfo | undefined): string {
  if (!info) {
    return ""
  }
  if (info.type === "array" && info.itemType) {
    return `array<${info.itemType}>`
  }
  return info.type
}

/**
 * Every schema path plus any current column the schema lacks, `_id` first,
 * each nested path directly under its parent. The schema map is in discovery
 * order, so a child first seen in a later document would otherwise land at
 * the end, away from its parent.
 */
export function pickerRows(schemaMap: SchemaMap, columnFields: string[]): PickerRow[] {
  const paths = [...new Set(["_id", ...schemaMap.keys(), ...columnFields])]
  const known = new Set(paths)
  const childrenOf = new Map<string, string[]>()
  for (const path of paths) {
    const parent = known.has(parentOf(path)) ? parentOf(path) : ""
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), path])
  }
  const rows: PickerRow[] = []
  const visit = (parent: string, depth: number) => {
    for (const path of childrenOf.get(parent) ?? []) {
      rows.push({ path, depth, type: typeLabel(schemaMap.get(path)) })
      visit(path, depth + 1)
    }
  }
  visit("", 0)
  return rows
}

/** The columns shown with no projection: every top-level path. */
export function defaultColumns(rows: PickerRow[]): string[] {
  return rows.filter((row) => row.depth === 0).map((row) => row.path)
}

/** What the picker opens with, in column order. */
export function initialChecked(projection: Projection | undefined, defaults: string[]): string[] {
  if (projection && isInclusion(projection)) {
    const included = Object.keys(projection).filter((k) => k !== "_id" && projection[k] === 1)
    return projection["_id"] === 0 ? included : ["_id", ...included]
  }
  return defaults.filter((path) => projection?.[path] !== 0)
}

function isWithin(path: string, ancestor: string): boolean {
  return path.startsWith(`${ancestor}.`)
}

/**
 * Check or uncheck a path. Checking drops its ancestors and descendants —
 * MongoDB rejects a projection naming both `a` and `a.b` (path collision).
 */
export function togglePath(checked: string[], path: string): string[] {
  if (checked.includes(path)) {
    return checked.filter((p) => p !== path)
  }
  return [...checked.filter((p) => !isWithin(path, p) && !isWithin(p, path)), path]
}

/**
 * Check every path in `paths`, or uncheck them all when they already are.
 * Paths are checked in order, so of an ancestor and its descendant the later
 * one wins, as with individual toggles.
 */
export function toggleAll(checked: string[], paths: string[]): string[] {
  if (paths.every((path) => checked.includes(path))) {
    const drop = new Set(paths)
    return checked.filter((p) => !drop.has(p))
  }
  return paths.reduce((acc, path) => (acc.includes(path) ? acc : togglePath(acc, path)), checked)
}

/** Move a checked path one column earlier (-1) or later (+1). */
export function moveChecked(checked: string[], path: string, delta: -1 | 1): string[] {
  const from = checked.indexOf(path)
  const to = from + delta
  if (from === -1 || to < 0 || to >= checked.length) {
    return checked
  }
  const next = [...checked]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

/**
 * Whether `checked` has to be written as an inclusion list: nested paths only
 * flatten that way, a custom order only survives that way, and past half the
 * columns it's the shorter of the two.
 */
export function needsInclusion(checked: string[], defaults: string[]): boolean {
  if (checked.some((path) => path.includes("."))) {
    return true
  }
  const inDefaultOrder = defaults.filter((path) => checked.includes(path))
  if (inDefaultOrder.join("\u0000") !== checked.join("\u0000")) {
    return true
  }
  const shown = checked.filter((path) => path !== "_id").length
  const hidden = defaults.length - checked.length
  return shown > 0 && shown < hidden
}

/**
 * The projection that shows `checked`: none for the default columns, else
 * `+path` tokens in column order or `-path` tokens for the unchecked
 * top-level columns, whichever `needsInclusion` picks.
 */
export function encodeSelection(checked: string[], defaults: string[]): Projection {
  const projection: Projection = {}
  if (needsInclusion(checked, defaults)) {
    for (const path of checked) {
      if (path !== "_id") {
        projection[path] = 1
      }
    }
    if (!checked.includes("_id")) {
      projection["_id"] = 0
    }
    return projection
  }
  for (const path of defaults) {
    if (!checked.includes(path)) {
      projection[path] = 0
    }
  }
  return projection
}
