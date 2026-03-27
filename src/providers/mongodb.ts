/**
 * MongoDB connection and query provider
 */

import { MongoClient, type Db, type Document, type Filter } from "mongodb"
import type { CollectionInfo } from "../types"

let client: MongoClient | null = null

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
export function init(uri: string): void {
  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  })
}

/** Get the database instance */
function getDb(): Db {
  if (!client) throw new Error("Not connected")
  return client.db()
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
  options: { skip?: number; limit?: number; sort?: Record<string, 1 | -1> } = {}
): Promise<{ documents: Document[]; count: number }> {
  const collection = getDb().collection(collectionName)
  const { skip = 0, limit = 50, sort } = options

  const [documents, count] = await Promise.all([
    collection.find(filter).sort(sort ?? { _id: -1 }).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ])

  return { documents, count }
}

/** Detect columns from a sample of documents, sorted: _id first, scalars before complex, then alphabetically */
export function detectColumns(documents: Document[]): string[] {
  if (documents.length === 0) return []

  const fieldCounts = new Map<string, number>()
  const fieldIsComplex = new Map<string, boolean>()

  for (const doc of documents) {
    for (const [key, value] of Object.entries(doc)) {
      fieldCounts.set(key, (fieldCounts.get(key) ?? 0) + 1)
      // Mark as complex if any value is object/array (not null, not Date, not ObjectId)
      if (
        value !== null &&
        typeof value === "object" &&
        !(value instanceof Date) &&
        !((value as { _bsontype?: string })._bsontype === "ObjectId") &&
        !((value as { _bsontype?: string })._bsontype === "ObjectID")
      ) {
        fieldIsComplex.set(key, true)
      }
    }
  }

  const threshold = documents.length * 0.3
  return [...fieldCounts.entries()]
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => {
      // _id always first
      if (a[0] === "_id") return -1
      if (b[0] === "_id") return 1
      // Scalars before complex
      const aComplex = fieldIsComplex.get(a[0]) ?? false
      const bComplex = fieldIsComplex.get(b[0]) ?? false
      if (aComplex !== bComplex) return aComplex ? 1 : -1
      // Alphabetically
      return a[0].localeCompare(b[0])
    })
    .map(([field]) => field)
}
