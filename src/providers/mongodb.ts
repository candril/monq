/**
 * MongoDB connection and query provider
 */

import { MongoClient, type Db, type Document, type Filter } from "mongodb"
import type { CollectionInfo } from "../types"

let client: MongoClient | null = null
let db: Db | null = null

/** Connect to MongoDB and return the database */
export async function connect(uri: string): Promise<{ db: Db; host: string; dbName: string }> {
  client = new MongoClient(uri)
  await client.connect()

  db = client.db()
  const dbName = db.databaseName

  // Extract host from URI for display
  let host = "localhost"
  try {
    const parsed = new URL(uri.replace("mongodb+srv://", "https://").replace("mongodb://", "http://"))
    host = parsed.hostname
  } catch {
    // Fallback
  }

  return { db, host, dbName }
}

/** Close the connection */
export async function disconnect(): Promise<void> {
  if (client) {
    await client.close()
    client = null
    db = null
  }
}

/** Get the current database instance */
export function getDb(): Db {
  if (!db) throw new Error("Not connected to MongoDB")
  return db
}

/** Switch to a different database on the same connection */
export function switchDatabase(dbName: string): Db {
  if (!client) throw new Error("Not connected to MongoDB")
  db = client.db(dbName)
  return db
}

/** List all databases */
export async function listDatabases(): Promise<string[]> {
  if (!client) throw new Error("Not connected to MongoDB")
  const result = await client.db().admin().listDatabases()
  return result.databases.map((d) => d.name)
}

/** List all collections with stats */
export async function listCollections(): Promise<CollectionInfo[]> {
  const database = getDb()
  const collections = await database.listCollections().toArray()

  const infos: CollectionInfo[] = await Promise.all(
    collections.map(async (col) => {
      let documentCount = 0
      let size = 0
      try {
        documentCount = await database.collection(col.name).estimatedDocumentCount()
        const stats = await database.collection(col.name).aggregate([
          { $collStats: { storageStats: {} } },
        ]).toArray().catch(() => [])
        if (stats.length > 0 && stats[0].storageStats) {
          size = stats[0].storageStats.size ?? 0
        }
      } catch {
        // Some collections may not support stats
      }

      return {
        name: col.name,
        type: (col.type ?? "collection") as CollectionInfo["type"],
        documentCount,
        size,
      }
    })
  )

  return infos.sort((a, b) => a.name.localeCompare(b.name))
}

/** Fetch documents from a collection */
export async function fetchDocuments(
  collectionName: string,
  filter: Filter<Document> = {},
  options: { skip?: number; limit?: number; sort?: Record<string, 1 | -1> } = {}
): Promise<{ documents: Document[]; count: number }> {
  const database = getDb()
  const collection = database.collection(collectionName)

  const { skip = 0, limit = 50, sort } = options

  const [documents, count] = await Promise.all([
    collection
      .find(filter)
      .sort(sort ?? { _id: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    collection.countDocuments(filter),
  ])

  return { documents, count }
}

/** Detect columns from a sample of documents */
export function detectColumns(documents: Document[]): string[] {
  if (documents.length === 0) return []

  const fieldCounts = new Map<string, number>()

  for (const doc of documents) {
    for (const key of Object.keys(doc)) {
      fieldCounts.set(key, (fieldCounts.get(key) ?? 0) + 1)
    }
  }

  // Use fields that appear in >30% of documents
  const threshold = documents.length * 0.3
  const columns = [...fieldCounts.entries()]
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => {
      // _id always first
      if (a[0] === "_id") return -1
      if (b[0] === "_id") return 1
      // Then by frequency, then alphabetically
      if (b[1] !== a[1]) return b[1] - a[1]
      return a[0].localeCompare(b[0])
    })
    .map(([field]) => field)

  return columns
}
