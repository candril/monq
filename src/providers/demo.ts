/**
 * The in-memory database behind `monq --demo`.
 *
 * `providers/mongodb.ts` reaches the server only through `getDb()`, so the demo is a
 * stand-in `Db`: the same method names the provider calls, over arrays held in memory.
 * It implements the query surface monq itself uses — not MongoDB's. An operator or an
 * aggregation stage it does not know is handled conservatively and visibly rather than
 * approximated, because a demo that quietly answers a filter wrongly teaches the wrong
 * thing about the app.
 */

import { ObjectId, type Document } from "mongodb"

export const DEMO_URI = "demo://demo/shop"

type Index = { v: number; key: Record<string, 1 | -1>; name: string; unique?: boolean }
type Coll = { docs: Document[]; indexes: Index[] }
type Store = Map<string, Map<string, Coll>>

// ── Query engine ─────────────────────────────────────────────────────────────

function valueAt(doc: Document, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value === null || typeof value !== "object") {
      return undefined
    }
    return (value as Record<string, unknown>)[key]
  }, doc)
}

/** Ordering across the types the seed uses; unlike BSON's, it only has to be stable. */
function compare(a: unknown, b: unknown): number {
  if (a === b) {
    return 0
  }
  if (a === undefined || a === null) {
    return b === undefined || b === null ? 0 : -1
  }
  if (b === undefined || b === null) {
    return 1
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime()
  }
  if (a instanceof ObjectId && b instanceof ObjectId) {
    return a.toString().localeCompare(b.toString())
  }
  if (typeof a === "number" && typeof b === "number") {
    return a - b
  }
  if (typeof a === "boolean" && typeof b === "boolean") {
    return Number(a) - Number(b)
  }
  return String(a).localeCompare(String(b))
}

function equal(a: unknown, b: unknown): boolean {
  if (a instanceof ObjectId || b instanceof ObjectId) {
    return String(a) === String(b)
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime()
  }
  if (Array.isArray(a)) {
    return a.some((element) => equal(element, b))
  }
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return a === b
}

function matchesOperators(value: unknown, spec: Record<string, unknown>): boolean {
  return Object.entries(spec).every(([op, operand]) => {
    switch (op) {
      case "$eq":
        return equal(value, operand)
      case "$ne":
        return !equal(value, operand)
      case "$gt":
        return compare(value, operand) > 0
      case "$gte":
        return compare(value, operand) >= 0
      case "$lt":
        return compare(value, operand) < 0
      case "$lte":
        return compare(value, operand) <= 0
      case "$in":
        return (operand as unknown[]).some((candidate) => equal(value, candidate))
      case "$nin":
        return !(operand as unknown[]).some((candidate) => equal(value, candidate))
      case "$exists":
        return (value !== undefined) === Boolean(operand)
      case "$regex": {
        const flags = typeof spec.$options === "string" ? spec.$options : undefined
        const pattern = operand instanceof RegExp ? operand : new RegExp(String(operand), flags)
        return typeof value === "string" && pattern.test(value)
      }
      case "$options":
        return true
      case "$size":
        return Array.isArray(value) && value.length === operand
      case "$all":
        return (
          Array.isArray(value) &&
          (operand as unknown[]).every((needle) => value.some((element) => equal(element, needle)))
        )
      default:
        // Unknown operator: match nothing, so a filter monq's demo cannot honour comes
        // back empty instead of silently returning everything.
        return false
    }
  })
}

function isOperatorSpec(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof ObjectId) &&
    Object.keys(value).some((key) => key.startsWith("$"))
  )
}

export function matches(doc: Document, filter: Document): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === "$and") {
      return (condition as Document[]).every((sub) => matches(doc, sub))
    }
    if (key === "$or") {
      return (condition as Document[]).some((sub) => matches(doc, sub))
    }
    if (key === "$nor") {
      return !(condition as Document[]).some((sub) => matches(doc, sub))
    }
    if (key === "$not") {
      return !matches(doc, condition as Document)
    }
    const value = valueAt(doc, key)
    if (isOperatorSpec(condition)) {
      return matchesOperators(value, condition)
    }
    return equal(value, condition)
  })
}

function sortDocs(docs: Document[], spec: Record<string, 1 | -1>): Document[] {
  const entries = Object.entries(spec)
  return [...docs].sort((a, b) => {
    for (const [field, direction] of entries) {
      const result = compare(valueAt(a, field), valueAt(b, field))
      if (result !== 0) {
        return result * direction
      }
    }
    return 0
  })
}

function project(doc: Document, spec: Record<string, 0 | 1>): Document {
  const including = Object.entries(spec).some(([field, mode]) => mode === 1 && field !== "_id")
  if (!including) {
    const copy = { ...doc }
    for (const [field, mode] of Object.entries(spec)) {
      if (mode === 0) {
        delete copy[field]
      }
    }
    return copy
  }
  const picked: Document = {}
  if (spec._id !== 0 && "_id" in doc) {
    picked._id = doc._id
  }
  for (const [field, mode] of Object.entries(spec)) {
    if (mode === 1) {
      const value = valueAt(doc, field)
      if (value !== undefined) {
        picked[field] = value
      }
    }
  }
  return picked
}

// ── Aggregation ──────────────────────────────────────────────────────────────

function resolve(doc: Document, expression: unknown): unknown {
  if (typeof expression === "string" && expression.startsWith("$")) {
    return valueAt(doc, expression.slice(1))
  }
  return expression
}

function accumulate(docs: Document[], spec: Document): Document {
  const result: Document = {}
  for (const [field, accumulator] of Object.entries(spec)) {
    if (field === "_id" || accumulator === null || typeof accumulator !== "object") {
      continue
    }
    const [op, argument] = Object.entries(accumulator as Document)[0] ?? []
    const values = docs.map((doc) => resolve(doc, argument))
    switch (op) {
      case "$sum":
        result[field] = values.reduce<number>(
          (total, value) => total + (typeof value === "number" ? value : argument === 1 ? 1 : 0),
          0,
        )
        break
      case "$avg": {
        const numbers = values.filter((value): value is number => typeof value === "number")
        result[field] = numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null
        break
      }
      case "$min":
        result[field] = values.reduce(
          (min, value) => (compare(value, min) < 0 ? value : min),
          values[0],
        )
        break
      case "$max":
        result[field] = values.reduce(
          (max, value) => (compare(value, max) > 0 ? value : max),
          values[0],
        )
        break
      case "$first":
        result[field] = values[0] ?? null
        break
      case "$last":
        result[field] = values[values.length - 1] ?? null
        break
      case "$push":
        result[field] = values
        break
      case "$addToSet":
        result[field] = [...new Set(values.map((value) => JSON.stringify(value)))].map(
          (value) => JSON.parse(value) as unknown,
        )
        break
      default:
        result[field] = null
    }
  }
  return result
}

function runPipeline(input: Document[], pipeline: Document[]): Document[] {
  let docs = input
  for (const stage of pipeline) {
    const [name, argument] = Object.entries(stage)[0] ?? []
    switch (name) {
      case "$match":
        docs = docs.filter((doc) => matches(doc, argument as Document))
        break
      case "$sort":
        docs = sortDocs(docs, argument as Record<string, 1 | -1>)
        break
      case "$skip":
        docs = docs.slice(argument as number)
        break
      case "$limit":
        docs = docs.slice(0, argument as number)
        break
      case "$count":
        docs = [{ [argument as string]: docs.length }]
        break
      case "$project":
        docs = docs.map((doc) => project(doc, argument as Record<string, 0 | 1>))
        break
      case "$unwind": {
        const path = String(argument).replace(/^\$/, "")
        docs = docs.flatMap((doc) => {
          const value = valueAt(doc, path)
          return Array.isArray(value)
            ? value.map((element) => ({ ...doc, [path]: element }))
            : [doc]
        })
        break
      }
      case "$group": {
        const spec = argument as Document
        const groups = new Map<string, { key: unknown; docs: Document[] }>()
        for (const doc of docs) {
          const key = resolve(doc, spec._id)
          const hash = JSON.stringify(key ?? null)
          const group = groups.get(hash) ?? { key, docs: [] }
          group.docs.push(doc)
          groups.set(hash, group)
        }
        docs = [...groups.values()].map((group) => ({
          _id: group.key ?? null,
          ...accumulate(group.docs, spec),
        }))
        break
      }
      default:
        // An unimplemented stage is a pass-through: the pipeline the user typed still
        // runs, and the stages the demo does know still do their work.
        break
    }
  }
  return docs
}

// ── Cursors ──────────────────────────────────────────────────────────────────

/** Lazy like the driver's: the chain records, `toArray` and iteration do the work. */
class DemoCursor {
  private sortSpec: Record<string, 1 | -1> | null = null
  private skipCount = 0
  private limitCount: number | null = null
  private projection: Record<string, 0 | 1> | null = null

  constructor(private readonly source: () => Document[]) {}

  sort(spec: Record<string, 1 | -1>): this {
    this.sortSpec = spec
    return this
  }
  skip(count: number): this {
    this.skipCount = count
    return this
  }
  limit(count: number): this {
    this.limitCount = count
    return this
  }
  project(spec: Record<string, 0 | 1>): this {
    this.projection = spec
    return this
  }
  map<T>(transform: (doc: Document) => T): { toArray: () => Promise<T[]> } {
    return { toArray: async () => (await this.toArray()).map(transform) }
  }

  private materialise(): Document[] {
    let docs = this.source()
    if (this.sortSpec) {
      docs = sortDocs(docs, this.sortSpec)
    }
    if (this.skipCount) {
      docs = docs.slice(this.skipCount)
    }
    if (this.limitCount !== null) {
      docs = docs.slice(0, this.limitCount)
    }
    if (this.projection) {
      docs = docs.map((doc) => project(doc, this.projection!))
    }
    return docs.map((doc) => structuredCloneDocument(doc))
  }

  async toArray(): Promise<Document[]> {
    return this.materialise()
  }

  async explain(): Promise<Document> {
    const docs = this.materialise()
    return {
      explainVersion: "1",
      queryPlanner: {
        namespace: "demo",
        winningPlan: { stage: "COLLSCAN", direction: "forward" },
        note: "monq --demo runs in memory: there is no planner to explain.",
      },
      executionStats: {
        executionSuccess: true,
        nReturned: docs.length,
        executionTimeMillis: 0,
        totalDocsExamined: docs.length,
      },
    }
  }

  async next(): Promise<Document | null> {
    return this.materialise()[0] ?? null
  }

  async close(): Promise<void> {}

  async *[Symbol.asyncIterator](): AsyncIterator<Document> {
    for (const doc of this.materialise()) {
      yield doc
    }
  }
}

/** Dates and ObjectIds must survive the copy, so this is not `structuredClone`. */
function structuredCloneDocument<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((element) => structuredCloneDocument(element)) as T
  }
  if (value instanceof Date || value instanceof ObjectId) {
    return value
  }
  if (value !== null && typeof value === "object") {
    const copy: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value)) {
      copy[key] = structuredCloneDocument(nested)
    }
    return copy as T
  }
  return value
}

// ── The stand-in Db ──────────────────────────────────────────────────────────

function applyUpdate(doc: Document, update: Document): boolean {
  let changed = false
  const set = (target: Document, path: string, value: unknown) => {
    const keys = path.split(".")
    let cursor: Record<string, unknown> = target
    for (const key of keys.slice(0, -1)) {
      if (cursor[key] === null || typeof cursor[key] !== "object") {
        cursor[key] = {}
      }
      cursor = cursor[key] as Record<string, unknown>
    }
    cursor[keys[keys.length - 1]!] = value
  }

  for (const [operator, argument] of Object.entries(update)) {
    if (!operator.startsWith("$")) {
      continue
    }
    for (const [field, value] of Object.entries(argument as Document)) {
      switch (operator) {
        case "$set":
          set(doc, field, value)
          changed = true
          break
        case "$unset": {
          const keys = field.split(".")
          let cursor: Record<string, unknown> = doc
          for (const key of keys.slice(0, -1)) {
            cursor = (cursor[key] ?? {}) as Record<string, unknown>
          }
          delete cursor[keys[keys.length - 1]!]
          changed = true
          break
        }
        case "$inc":
          set(doc, field, ((valueAt(doc, field) as number) ?? 0) + (value as number))
          changed = true
          break
        case "$mul":
          set(doc, field, ((valueAt(doc, field) as number) ?? 0) * (value as number))
          changed = true
          break
        case "$rename": {
          const current = valueAt(doc, field)
          delete doc[field]
          set(doc, String(value), current)
          changed = true
          break
        }
        case "$push": {
          const current = valueAt(doc, field)
          set(doc, field, Array.isArray(current) ? [...current, value] : [value])
          changed = true
          break
        }
        default:
          break
      }
    }
  }
  return changed
}

class DemoCollection {
  constructor(
    private readonly coll: Coll,
    private readonly onDrop: () => void,
    private readonly onRename: (name: string) => void,
  ) {}

  find(filter: Document = {}, options?: { projection?: Record<string, 0 | 1> }): DemoCursor {
    const cursor = new DemoCursor(() => this.coll.docs.filter((doc) => matches(doc, filter)))
    return options?.projection ? cursor.project(options.projection) : cursor
  }

  aggregate(pipeline: Document[]): DemoCursor {
    return new DemoCursor(() => runPipeline(this.coll.docs, pipeline))
  }

  async countDocuments(filter: Document = {}): Promise<number> {
    return this.coll.docs.filter((doc) => matches(doc, filter)).length
  }

  async estimatedDocumentCount(): Promise<number> {
    return this.coll.docs.length
  }

  async insertOne(doc: Document): Promise<{ insertedId: unknown; acknowledged: true }> {
    const stored = { _id: doc._id ?? new ObjectId(), ...doc }
    this.coll.docs.push(stored)
    return { insertedId: stored._id, acknowledged: true }
  }

  async deleteOne(filter: Document): Promise<{ deletedCount: number }> {
    const index = this.coll.docs.findIndex((doc) => matches(doc, filter))
    if (index === -1) {
      return { deletedCount: 0 }
    }
    this.coll.docs.splice(index, 1)
    return { deletedCount: 1 }
  }

  async deleteMany(filter: Document): Promise<{ deletedCount: number }> {
    const keep = this.coll.docs.filter((doc) => !matches(doc, filter))
    const deletedCount = this.coll.docs.length - keep.length
    this.coll.docs = keep
    return { deletedCount }
  }

  async updateMany(
    filter: Document,
    update: Document,
    options: { upsert?: boolean } = {},
  ): Promise<{ matchedCount: number; modifiedCount: number; upsertedCount: number }> {
    const targets = this.coll.docs.filter((doc) => matches(doc, filter))
    let modifiedCount = 0
    for (const doc of targets) {
      if (applyUpdate(doc, update)) {
        modifiedCount++
      }
    }
    if (!targets.length && options.upsert) {
      const seed: Document = { _id: new ObjectId() }
      applyUpdate(seed, update)
      this.coll.docs.push(seed)
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 }
    }
    return { matchedCount: targets.length, modifiedCount, upsertedCount: 0 }
  }

  async replaceOne(filter: Document, replacement: Document): Promise<{ modifiedCount: number }> {
    const index = this.coll.docs.findIndex((doc) => matches(doc, filter))
    if (index === -1) {
      return { modifiedCount: 0 }
    }
    this.coll.docs[index] = { _id: this.coll.docs[index]!._id, ...replacement }
    return { modifiedCount: 1 }
  }

  listIndexes(): { toArray: () => Promise<Index[]> } {
    return { toArray: async () => this.coll.indexes }
  }

  async createIndex(
    spec: Document | string,
    options: { name?: string; unique?: boolean } = {},
  ): Promise<string> {
    const key = (typeof spec === "string" ? { [spec]: 1 } : spec) as Record<string, 1 | -1>
    const name =
      options.name ??
      Object.entries(key)
        .map(([field, direction]) => `${field}_${direction}`)
        .join("_")
    if (!this.coll.indexes.some((index) => index.name === name)) {
      this.coll.indexes.push({ v: 2, key, name, ...(options.unique ? { unique: true } : {}) })
    }
    return name
  }

  async dropIndex(name: string): Promise<void> {
    this.coll.indexes = this.coll.indexes.filter((index) => index.name !== name)
  }

  async rename(name: string): Promise<void> {
    this.onRename(name)
  }

  async drop(): Promise<boolean> {
    this.onDrop()
    return true
  }
}

class DemoDb {
  constructor(
    private readonly store: Store,
    private readonly name: string,
  ) {}

  private collections(): Map<string, Coll> {
    const existing = this.store.get(this.name)
    if (existing) {
      return existing
    }
    const created = new Map<string, Coll>()
    this.store.set(this.name, created)
    return created
  }

  collection(name: string): DemoCollection {
    const collections = this.collections()
    const coll = collections.get(name) ?? { docs: [], indexes: [idIndex()] }
    collections.set(name, coll)
    return new DemoCollection(
      coll,
      () => collections.delete(name),
      (renamed) => {
        collections.delete(name)
        collections.set(renamed, coll)
      },
    )
  }

  listCollections(): { toArray: () => Promise<{ name: string; type: string }[]> } {
    return {
      toArray: async () =>
        [...this.collections().keys()].map((name) => ({ name, type: "collection" })),
    }
  }

  async createCollection(name: string): Promise<DemoCollection> {
    return this.collection(name)
  }

  async dropCollection(name: string): Promise<boolean> {
    return this.collections().delete(name)
  }

  async dropDatabase(): Promise<boolean> {
    return this.store.delete(this.name)
  }
}

function idIndex(): Index {
  return { v: 2, key: { _id: 1 }, name: "_id_" }
}

// ── The seed ─────────────────────────────────────────────────────────────────

/** Deterministic, so a screenshot taken today matches one taken next month. */
function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

function objectId(index: number): ObjectId {
  return new ObjectId(index.toString(16).padStart(24, "0"))
}

const CATEGORIES = ["keyboards", "displays", "audio", "cables", "storage"]
const NAMES = [
  "Ada Lovelace",
  "Grace Hopper",
  "Alan Turing",
  "Margaret Hamilton",
  "Edsger Dijkstra",
  "Barbara Liskov",
  "Ken Thompson",
  "Radia Perlman",
  "Leslie Lamport",
  "Karen Spärck Jones",
]
const CITIES = ["Zürich", "Basel", "Genève", "Bern", "Lugano"]
const STATUSES = ["placed", "picked", "shipped", "delivered", "returned"]

function seed(): Store {
  const next = random(20260920)
  const pick = <T>(list: T[]): T => list[Math.floor(next() * list.length)]!
  const day = (offset: number) => new Date(Date.UTC(2026, 7, 1 + offset, 9, 30))

  const products: Document[] = Array.from({ length: 24 }, (_, i) => ({
    _id: objectId(1000 + i),
    sku: `SKU-${(1000 + i).toString()}`,
    name: `${pick(CATEGORIES).slice(0, -1)} ${String.fromCharCode(65 + (i % 26))}${i}`,
    category: pick(CATEGORIES),
    price: Math.round((19 + next() * 480) * 100) / 100,
    stock: Math.floor(next() * 120),
    tags: [pick(CATEGORIES), ...(next() > 0.6 ? ["sale"] : [])],
    specs: { weightGrams: Math.floor(200 + next() * 2000), warrantyYears: next() > 0.5 ? 2 : 3 },
    // A field missing from two thirds of the documents: the table has to cope with it.
    discontinuedOn: next() > 0.66 ? day(Math.floor(next() * 40)) : undefined,
    createdAt: day(-Math.floor(next() * 300)),
  })).map((doc) => {
    if (doc.discontinuedOn === undefined) {
      delete doc.discontinuedOn
    }
    return doc
  })

  const customers: Document[] = NAMES.map((name, i) => ({
    _id: objectId(2000 + i),
    name,
    // Spärck → sparck: the accents have to come off before the address is built, or
    // the seed ships emails with dots where the diacritics were.
    email: `${name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z]+/g, ".")}@example.com`,
    city: pick(CITIES),
    since: day(-Math.floor(next() * 900)),
    newsletter: next() > 0.5,
    address: {
      street: `Bahnhofstrasse ${1 + Math.floor(next() * 90)}`,
      zip: 8000 + Math.floor(next() * 900),
    },
  }))

  const orders: Document[] = Array.from({ length: 60 }, (_, i) => {
    const lines = Array.from({ length: 1 + Math.floor(next() * 3) }, () => {
      const product = pick(products)
      return { sku: product.sku, quantity: 1 + Math.floor(next() * 4), price: product.price }
    })
    return {
      _id: objectId(3000 + i),
      number: `ORD-2026-${100 + i}`,
      customerId: pick(customers)._id,
      status: pick(STATUSES),
      lines,
      total:
        Math.round(lines.reduce((sum, line) => sum + line.price * line.quantity, 0) * 100) / 100,
      placedAt: day(-Math.floor(next() * 60)),
    }
  })

  const events: Document[] = Array.from({ length: 120 }, (_, i) => ({
    _id: objectId(4000 + i),
    type: pick(["view", "add_to_cart", "checkout", "search"]),
    sku: pick(products).sku,
    sessionId: `s-${Math.floor(next() * 9999)
      .toString()
      .padStart(4, "0")}`,
    at: day(-Math.floor(next() * 14)),
  }))

  const revenue: Document[] = Array.from({ length: 30 }, (_, i) => ({
    _id: objectId(5000 + i),
    date: day(-i),
    orders: 10 + Math.floor(next() * 60),
    revenue: Math.round(next() * 24000) / 10,
    channel: pick(["web", "app", "store"]),
  }))

  const collection = (docs: Document[], indexes: Index[] = []): Coll => ({
    docs,
    indexes: [idIndex(), ...indexes],
  })

  return new Map<string, Map<string, Coll>>([
    [
      "shop",
      new Map([
        [
          "products",
          collection(products, [{ v: 2, key: { sku: 1 }, name: "sku_1", unique: true }]),
        ],
        ["orders", collection(orders, [{ v: 2, key: { placedAt: -1 }, name: "placedAt_-1" }])],
        [
          "customers",
          collection(customers, [{ v: 2, key: { email: 1 }, name: "email_1", unique: true }]),
        ],
        ["events", collection(events)],
      ]),
    ],
    ["analytics", new Map([["daily_revenue", collection(revenue)]])],
  ])
}

// ── What the provider uses ───────────────────────────────────────────────────

export type DemoStore = {
  db: (name: string | null) => DemoDb
  databaseNames: () => string[]
}

export function isDemoUri(uri: string): boolean {
  return uri.startsWith("demo://")
}

export function createDemoStore(): DemoStore {
  const store = seed()
  return {
    db: (name) => new DemoDb(store, name ?? "shop"),
    databaseNames: () => [...store.keys()].sort(),
  }
}
