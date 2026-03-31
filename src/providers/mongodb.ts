/**
 * MongoDB connection and query provider
 */

import { MongoClient, type Db, type Document, type Filter, type UpdateFilter, type IndexSpecification, type CreateIndexesOptions } from "mongodb"
import type { CollectionInfo, IndexInfo } from "../types"

let client: MongoClient | null = null
let activeDb: string | null = null

/** Parse connection info from URI without connecting */
export function parseUri(uri: string): { host: string; dbName: string } {
  let host = "localhost"
  let dbName = ""
  try {
    const normalized = uri.replace("mongodb+srv://", "https://").replace("mongodb://", "http://")
    const parsed = new URL(normalized)
    host = parsed.hostname
    dbName = parsed.pathname.replace(/^\//, "").split("/")[0] || ""
  } catch {
    // Fallback
  }
  return { host, dbName }
}

/** Initialize the client (lazy — actual connection happens on first operation) */
export function init(uri: string, dbName?: string): void {
  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  })
  activeDb = dbName ?? null
}

/** Set the active database without reconnecting */
export function switchDatabase(dbName: string): void {
  activeDb = dbName
}

/** List all databases on the server */
export async function listDatabases(): Promise<string[]> {
  if (!client) throw new Error("Not connected")
  const result = await client.db().admin().listDatabases()
  return result.databases.map((d) => d.name).sort()
}

/** Get the database instance */
function getDb(): Db {
  if (!client) throw new Error("Not connected")
  return client.db(activeDb ?? undefined)
}

/** Close the connection */
export async function disconnect(): Promise<void> {
  if (client) {
    await client.close(true)
    client = null
  }
}

/** List all collections (names and types) */
export async function listCollections(): Promise<CollectionInfo[]> {
  const collections = await getDb().listCollections().toArray()
  return collections
    .map((col) => ({
      name: col.name,
      type: (col.type ?? "collection") as CollectionInfo["type"],
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Fetch documents from a collection */
export async function fetchDocuments(
  collectionName: string,
  filter: Filter<Document> = {},
  options: {
    skip?: number
    limit?: number
    sort?: Record<string, 1 | -1>
    projection?: Record<string, 0 | 1>
  } = {},
): Promise<{ documents: Document[]; count: number; totalCount: number }> {
  const collection = getDb().collection(collectionName)
  const { skip = 0, limit = 50, sort, projection } = options

  const hasFilter = Object.keys(filter).length > 0

  const cursor = collection.find(filter, projection ? { projection } : undefined)
  const [documents, count, totalCount] = await Promise.all([
    cursor
      .sort(sort ?? { _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    collection.countDocuments(filter),
    hasFilter ? collection.estimatedDocumentCount() : Promise.resolve(0),
  ])

  return { documents, count, totalCount: hasFilter ? totalCount : count }
}

/** Run an aggregation pipeline */
export async function fetchAggregate(
  collectionName: string,
  pipeline: Document[],
  options: { limit?: number } = {},
): Promise<{ documents: Document[]; count: number }> {
  const collection = getDb().collection(collectionName)
  const { limit = 200 } = options

  // Run pipeline + a parallel count pipeline (append $count stage)
  const countPipeline = [...pipeline, { $count: "__count" }]

  const [documents, countResult] = await Promise.all([
    collection.aggregate(pipeline).limit(limit).toArray(),
    collection.aggregate(countPipeline).toArray(),
  ])

  const count = (countResult[0] as Record<string, number>)?.__count ?? documents.length
  return { documents, count }
}

/** Insert a new document into a collection */
export async function insertDocument(collectionName: string, doc: Document): Promise<void> {
  const collection = getDb().collection(collectionName)
  await collection.insertOne(doc)
}

/** Delete a document by its _id */
export async function deleteDocument(collectionName: string, id: unknown): Promise<void> {
  const collection = getDb().collection(collectionName)
  await collection.deleteOne({ _id: id as Document["_id"] })
}

/** Run updateMany with an update operator expression */
export async function updateManyDocuments(
  collectionName: string,
  filter: Filter<Document>,
  update: UpdateFilter<Document> | Document,
  options: { upsert?: boolean } = {},
): Promise<{ matchedCount: number; modifiedCount: number; upsertedCount: number }> {
  const collection = getDb().collection(collectionName)
  const result = await collection.updateMany(filter, update, { upsert: options.upsert ?? false })
  return {
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
    upsertedCount: result.upsertedCount,
  }
}

/** Count documents matching a filter (exact count) */
export async function countDocuments(
  collectionName: string,
  filter: Filter<Document>,
): Promise<number> {
  const collection = getDb().collection(collectionName)
  return collection.countDocuments(filter)
}

/** Delete all documents matching a filter */
export async function deleteManyDocuments(
  collectionName: string,
  filter: Filter<Document>,
): Promise<{ deletedCount: number }> {
  const collection = getDb().collection(collectionName)
  const result = await collection.deleteMany(filter)
  return { deletedCount: result.deletedCount }
}

/** Create a collection in the active database (also materialises the database) */
export async function createCollection(collectionName: string): Promise<void> {
  await getDb().createCollection(collectionName)
}

/** Create a new database by creating a first collection inside it */
export async function createDatabase(dbName: string, firstCollection: string): Promise<void> {
  if (!client) throw new Error("Not connected")
  await client.db(dbName).createCollection(firstCollection)
}

/** Rename a collection in the active database */
export async function renameCollection(oldName: string, newName: string): Promise<void> {
  await getDb().collection(oldName).rename(newName)
}

/** Drop a collection from the active database */
export async function dropCollection(collectionName: string): Promise<void> {
  await getDb().dropCollection(collectionName)
}

/** Drop a database */
export async function dropDatabase(dbName: string): Promise<void> {
  if (!client) throw new Error("Not connected")
  await client.db(dbName).dropDatabase()
}

/** List all indexes on a collection */
export async function listIndexes(collectionName: string): Promise<IndexInfo[]> {
  const collection = getDb().collection(collectionName)
  const indexes = await collection.listIndexes().toArray()
  return indexes as IndexInfo[]
}

/** Create an index on a collection */
export async function createIndex(
  collectionName: string,
  keySpec: IndexSpecification,
  options: CreateIndexesOptions = {},
): Promise<string> {
  const collection = getDb().collection(collectionName)
  return collection.createIndex(keySpec, options)
}

/** Drop an index by name */
export async function dropIndex(collectionName: string, indexName: string): Promise<void> {
  const collection = getDb().collection(collectionName)
  await collection.dropIndex(indexName)
}

/** Replace a document by its original _id */
export async function replaceDocument(
  collectionName: string,
  originalId: unknown,
  newDoc: Document,
): Promise<void> {
  const collection = getDb().collection(collectionName)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await collection.replaceOne({ _id: originalId as any }, newDoc)
}
