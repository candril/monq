/**
 * Index management actions.
 * openEditorForCreateIndex — open $EDITOR with current indexes shown as read-only
 * comments at the top, and an array of new index definitions to fill in at the bottom.
 * Save to get a parsed result; the caller shows a confirmation dialog before applying.
 */

import { tmpdir } from "os"
import { join } from "path"
import { mkdir } from "fs/promises"
import JSON5 from "json5"
import type { IndexSpecification, CreateIndexesOptions } from "mongodb"
import { listIndexes, createIndex, dropIndex } from "../providers/mongodb"
import { getEditor, stripComments, stripErrorComment } from "../utils/editor"
import type { IndexInfo, IndexDef } from "../types"

// ── Schema sidecar ────────────────────────────────────────────────────────────

const SCHEMA_FILENAME = ".monq-index-schema.json"

function buildIndexSchema(schemaMap?: import("../query/schema").SchemaMap): object {
  // Build properties object with all known fields from the schema
  const keyProperties: Record<string, object> = {}
  if (schemaMap && schemaMap.size > 0) {
    for (const [path] of schemaMap) {
      if (!path.includes(".")) {
        // top-level fields only
        keyProperties[path] = {
          oneOf: [
            { type: "number", enum: [1, -1], description: "1 = ascending, -1 = descending" },
            {
              type: "string",
              enum: ["text", "2dsphere", "hashed"],
              description: "Special index type",
            },
          ],
        }
      }
    }
  }

  return {
    $schema: "http://json-schema.org/draft-07/schema",
    title: "Monq — create indexes",
    type: "object",
    required: ["indexes"],
    properties: {
      $schema: { type: "string" },
      indexes: {
        type: "array",
        items: {
          type: "object",
          required: ["key", "options"],
          properties: {
            key: {
              type: "object",
              description:
                'Field(s) and sort direction. Values: 1 (asc), -1 (desc), "text", "2dsphere", "hashed"',
              minProperties: 1,
              properties: keyProperties,
              additionalProperties: {
                oneOf: [
                  { type: "number", enum: [1, -1] },
                  { type: "string", enum: ["text", "2dsphere", "hashed"] },
                ],
              },
            },
            options: {
              type: "object",
              required: ["name"],
              properties: {
                name: { type: "string", minLength: 1, description: "Index name (required)" },
                unique: { type: "boolean", description: "Enforce uniqueness" },
                sparse: { type: "boolean", description: "Only index docs that have the field" },
                expireAfterSeconds: {
                  type: "number",
                  description: "TTL in seconds (Date fields only)",
                },
                background: {
                  type: "boolean",
                  description: "Build in background (deprecated in 4.2+)",
                },
                partialFilterExpression: { type: "object", description: "Partial index filter" },
                collation: { type: "object", description: "Collation document" },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  }
}

// ── Header / template ─────────────────────────────────────────────────────────

function buildHeader(
  collectionName: string,
  dbName: string,
  schemaMap?: import("../query/schema").SchemaMap,
): string {
  const fieldLines =
    schemaMap && schemaMap.size > 0
      ? [...schemaMap.keys()]
          .filter((p) => !p.includes("."))
          .slice(0, 10)
          .map((f) => `//   ${f}`)
      : ["//   (no schema sampled)"]

  return [
    `// Monq — indexes on ${collectionName} @ ${dbName}`,
    `// Edit the "indexes" array below, then save (:wq) to apply changes.`,
    `// Quit without saving (:q!) to cancel.`,
    `//`,
    `// key     — field(s) and direction: { field: 1 } or { a: 1, b: -1 }`,
    `//           Special types: "text", "2dsphere", "hashed"`,
    `// options — name (required), unique, sparse, expireAfterSeconds, etc.`,
    `//`,
    `// • Add a new entry to create an index`,
    `// • Remove an entry to drop an index`,
    `// • Edit an entry to replace it (drop + recreate)`,
    `//`,
    `// Available fields (autocomplete via JSON Schema):`,
    ...fieldLines,
    ``,
  ].join("\n")
}

function buildTemplateBody(existing: IndexInfo[]): string {
  if (existing.length === 0) {
    return `{
  "$schema": "./.monq-index-schema.json",
  "indexes": [
    {
      "key": {},
      "options": {
        "name": ""
      }
    }
  ]
}
`
  }

  const items = existing
    .map((idx) => {
      const opts: Record<string, unknown> = { name: idx.name }
      if (idx.unique) opts.unique = true
      if (idx.sparse) opts.sparse = true
      if (idx.expireAfterSeconds !== undefined) opts.expireAfterSeconds = idx.expireAfterSeconds
      const entry = { key: idx.key, options: opts }
      return `    ${JSON.stringify(entry, null, 2).replace(/\n/g, "\n    ")}`
    })
    .join(",\n")

  return `{
  "$schema": "./.monq-index-schema.json",
  "indexes": [
${items}
  ]
}
`
}

// ── Parsing ───────────────────────────────────────────────────────────────────

function parseIndexDefs(json: string): IndexDef[] {
  const clean = stripComments(json)
  const raw = JSON5.parse(clean)
  if (typeof raw !== "object" || raw === null) {
    throw new Error('Expected a JSON object with an "indexes" array')
  }
  const obj = raw as Record<string, unknown>
  if (!("indexes" in obj)) {
    throw new Error('Missing "indexes" field')
  }
  const arr = obj.indexes
  if (!Array.isArray(arr)) {
    throw new Error('"indexes" must be an array')
  }
  return arr.map((item: unknown, i: number) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`Item ${i + 1}: expected an object`)
    }
    const entry = item as Record<string, unknown>
    if (!("key" in entry)) throw new Error(`Item ${i + 1}: missing "key" field`)
    const key = entry.key as IndexSpecification
    if (typeof key !== "object" || key === null || Array.isArray(key)) {
      throw new Error(`Item ${i + 1}: "key" must be an object, e.g. { email: 1 }`)
    }
    if (Object.keys(key).length === 0) {
      throw new Error(`Item ${i + 1}: "key" must not be empty — add at least one field`)
    }
    const options = (entry.options ?? {}) as CreateIndexesOptions & { name?: string }
    const name = options.name
    if (typeof name !== "string" || name.trim() === "") {
      throw new Error(`Item ${i + 1}: "options.name" is required — provide a non-empty string`)
    }
    return { name: name.trim(), key, options }
  })
}

// ── Error injection ───────────────────────────────────────────────────────────

function injectError(content: string, errorMsg: string): string {
  return `// !! PARSE ERROR: ${errorMsg}\n// Fix the JSON below and save, or delete all content to cancel.\n\n${stripErrorComment(content)}`
}

// ── Result types ──────────────────────────────────────────────────────────────

export type OpenIndexEditorOutcome =
  | { cancelled: true }
  | {
      cancelled: false
      toCreate: IndexDef[]
      toDrop: string[]
      /** Names being replaced (drop+recreate due to edit) */
      toReplace: string[]
      apply: () => Promise<{ created: number; dropped: number; errors: string[] }>
    }

// ── Main entry point ──────────────────────────────────────────────────────────

export async function openEditorForIndexes(
  collectionName: string,
  dbName: string,
  schemaMap?: import("../query/schema").SchemaMap,
): Promise<OpenIndexEditorOutcome> {
  const dir = join(tmpdir(), "monq", collectionName)
  await mkdir(dir, { recursive: true })

  // Write schema sidecar with known fields from schemaMap
  const schemaFile = join(dir, SCHEMA_FILENAME)
  await Bun.write(schemaFile, JSON.stringify(buildIndexSchema(schemaMap), null, 2))

  // Fetch existing indexes for the header
  const existing = await listIndexes(collectionName)
  const tmpFile = join(dir, `index-${Date.now()}.jsonc`)
  const header = buildHeader(collectionName, dbName, schemaMap)
  await Bun.write(tmpFile, header + buildTemplateBody(existing))

  const editor = getEditor()

  // Editor retry loop
  while (true) {
    const proc = Bun.spawn([editor, tmpFile], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })
    await proc.exited

    if (proc.exitCode !== 0) return { cancelled: true }

    let edited: string
    try {
      edited = await Bun.file(tmpFile).text()
    } catch {
      return { cancelled: true }
    }

    const body = stripComments(stripErrorComment(edited))
    if (body === "") return { cancelled: true }

    let defs: IndexDef[]
    try {
      defs = parseIndexDefs(edited)
    } catch (err) {
      await Bun.write(tmpFile, injectError(edited, (err as Error).message))
      continue
    }

    // Diff: determine what's been added, removed, or edited
    const existingByName = new Map(existing.map((idx) => [idx.name, idx]))
    const editedByName = new Map(defs.map((d) => [d.name, d]))

    const toCreate: IndexDef[] = []
    const toDrop: string[] = []
    const toReplace: string[] = []

    // Check for new or edited indexes
    for (const def of defs) {
      const orig = existingByName.get(def.name)
      if (!orig) {
        // New index
        toCreate.push(def)
      } else {
        // Exists — check if edited (key or relevant options changed)
        const origOpts: Record<string, unknown> = { name: orig.name }
        if (orig.unique) origOpts.unique = true
        if (orig.sparse) origOpts.sparse = true
        if (orig.expireAfterSeconds !== undefined)
          origOpts.expireAfterSeconds = orig.expireAfterSeconds

        const origStr = JSON.stringify({ key: orig.key, options: origOpts })
        const editedStr = JSON.stringify({ key: def.key, options: def.options })

        if (origStr !== editedStr) {
          // Edited — drop + recreate
          toReplace.push(def.name)
          toDrop.push(def.name)
          toCreate.push(def)
        }
      }
    }

    // Check for removed indexes
    for (const idx of existing) {
      if (!editedByName.has(idx.name)) {
        toDrop.push(idx.name)
      }
    }

    // If nothing changed, cancel
    if (toCreate.length === 0 && toDrop.length === 0) {
      return { cancelled: true }
    }

    const apply = async (): Promise<{ created: number; dropped: number; errors: string[] }> => {
      const errors: string[] = []
      let dropped = 0
      let created = 0

      // Drop first
      for (const name of toDrop) {
        try {
          await dropIndex(collectionName, name)
          dropped++
        } catch (err) {
          errors.push(`Drop "${name}": ${(err as Error).message}`)
        }
      }

      // Then create
      for (const def of toCreate) {
        try {
          await createIndex(collectionName, def.key, def.options)
          created++
        } catch (err) {
          errors.push(`Create "${def.name}": ${(err as Error).message}`)
        }
      }

      return { created, dropped, errors }
    }

    return { cancelled: false, toCreate, toDrop, toReplace, apply }
  }
}
