import { describe, expect, test } from "bun:test"
import { createDemoStore, matches } from "./demo"

const shop = () => createDemoStore().db("shop")

describe("filters", () => {
  const doc = {
    name: "keyboard A",
    price: 120,
    tags: ["audio", "sale"],
    specs: { warrantyYears: 2 },
  }

  test("equality reaches into nested paths and arrays", () => {
    expect(matches(doc, { name: "keyboard A" })).toBe(true)
    expect(matches(doc, { "specs.warrantyYears": 2 })).toBe(true)
    expect(matches(doc, { tags: "sale" })).toBe(true)
    expect(matches(doc, { tags: "clearance" })).toBe(false)
  })

  test("comparison, membership and existence", () => {
    expect(matches(doc, { price: { $gt: 100, $lte: 120 } })).toBe(true)
    expect(matches(doc, { price: { $in: [10, 120] } })).toBe(true)
    expect(matches(doc, { missing: { $exists: false } })).toBe(true)
    expect(matches(doc, { name: { $regex: "^key" } })).toBe(true)
  })

  test("$and and $or combine", () => {
    expect(matches(doc, { $or: [{ price: 1 }, { name: "keyboard A" }] })).toBe(true)
    expect(matches(doc, { $and: [{ price: { $gt: 100 } }, { name: "nope" }] })).toBe(false)
  })

  test("$regex matches array elements and paths through arrays of objects", () => {
    const order = { items: [{ name: "Mouse" }, { name: "Cable" }] }

    expect(matches(doc, { tags: { $regex: "^sa" } })).toBe(true)
    expect(matches(order, { "items.name": { $regex: "cab", $options: "i" } })).toBe(true)
    expect(matches(order, { "items.name": "Mouse" })).toBe(true)
  })

  test("$text needs every phrase and one of the bare words", () => {
    expect(matches(doc, { $text: { $search: '"keyboard" "sale"' } })).toBe(true)
    expect(matches(doc, { $text: { $search: '"keyboard" "nope"' } })).toBe(false)
    expect(matches(doc, { $text: { $search: "nope audio" } })).toBe(true)
  })

  test("an operator the demo does not implement matches nothing", () => {
    expect(matches(doc, { price: { $mod: [2, 0] } })).toBe(false)
  })
})

describe("cursors", () => {
  test("sort, skip and limit apply in that order", async () => {
    const products = shop().collection("products")
    const all = await products.find().sort({ price: 1 }).toArray()
    const page = await products.find().sort({ price: 1 }).skip(2).limit(3).toArray()

    expect(page).toHaveLength(3)
    expect(page.map((d) => d._id)).toEqual(all.slice(2, 5).map((d) => d._id))
  })

  test("projection keeps _id unless it is excluded", async () => {
    const [doc] = await shop()
      .collection("products")
      .find({}, { projection: { sku: 1 } })
      .limit(1)
      .toArray()
    expect(Object.keys(doc!).sort()).toEqual(["_id", "sku"])
  })

  test("counts distinguish filtered from total", async () => {
    const orders = shop().collection("orders")
    const placed = await orders.countDocuments({ status: "placed" })
    const total = await orders.estimatedDocumentCount()
    expect(total).toBe(60)
    expect(placed).toBeLessThan(total)
  })
})

describe("aggregation", () => {
  test("$match, $group and $sort produce grouped totals", async () => {
    const result = await shop()
      .collection("orders")
      .aggregate([
        { $match: { status: "delivered" } },
        { $group: { _id: "$status", orders: { $sum: 1 }, revenue: { $sum: "$total" } } },
        { $sort: { orders: -1 } },
      ])
      .toArray()

    expect(result).toHaveLength(1)
    expect(result[0]!._id).toBe("delivered")
    expect(result[0]!.orders).toBeGreaterThan(0)
  })

  test("$count returns a single document", async () => {
    const [count] = await shop()
      .collection("events")
      .aggregate([{ $count: "n" }])
      .toArray()
    expect(count!.n).toBe(120)
  })

  test("a stage the demo does not implement passes documents through", async () => {
    const result = await shop()
      .collection("customers")
      .aggregate([{ $lookup: { from: "orders" } }, { $count: "n" }])
      .toArray()
    expect(result[0]!.n).toBe(10)
  })
})

describe("writes", () => {
  test("insert, update, replace and delete are visible immediately", async () => {
    const products = shop().collection("products")

    await products.insertOne({ sku: "SKU-9999", name: "demo", price: 10, stock: 1 })
    expect(await products.countDocuments({ sku: "SKU-9999" })).toBe(1)

    const updated = await products.updateMany(
      { sku: "SKU-9999" },
      { $set: { price: 12 }, $inc: { stock: 4 } },
    )
    expect(updated.modifiedCount).toBe(1)
    const [after] = await products.find({ sku: "SKU-9999" }).toArray()
    expect(after!.price).toBe(12)
    expect(after!.stock).toBe(5)

    await products.replaceOne({ sku: "SKU-9999" }, { sku: "SKU-9999", name: "replaced" })
    const [replaced] = await products.find({ sku: "SKU-9999" }).toArray()
    expect(replaced!.name).toBe("replaced")
    expect(replaced!.price).toBeUndefined()

    expect((await products.deleteMany({ sku: "SKU-9999" })).deletedCount).toBe(1)
    expect(await products.countDocuments({ sku: "SKU-9999" })).toBe(0)
  })

  test("a cursor hands out copies, so an edit cannot reach back into the store", async () => {
    const products = shop().collection("products")
    const [doc] = await products.find().limit(1).toArray()
    doc!.name = "scribbled"
    const [again] = await products.find({ _id: doc!._id }).toArray()
    expect(again!.name).not.toBe("scribbled")
  })
})

describe("catalogue", () => {
  test("databases and collections are there before anything is asked of them", async () => {
    const store = createDemoStore()
    expect(store.databaseNames()).toEqual(["analytics", "shop"])
    const names = (await store.db("shop").listCollections().toArray()).map((c) => c.name)
    expect(names.sort()).toEqual(["customers", "events", "orders", "products"])
  })

  test("indexes list, create and drop", async () => {
    const products = shop().collection("products")
    expect((await products.listIndexes().toArray()).map((i) => i.name)).toContain("sku_1")

    const name = await products.createIndex({ price: -1 })
    expect(name).toBe("price_-1")
    await products.dropIndex(name)
    expect((await products.listIndexes().toArray()).map((i) => i.name)).not.toContain("price_-1")
  })

  test("dropping and renaming a collection changes the catalogue", async () => {
    const db = shop()
    await db.collection("events").rename("telemetry")
    const afterRename = (await db.listCollections().toArray()).map((c) => c.name)
    expect(afterRename).toContain("telemetry")
    expect(afterRename).not.toContain("events")

    await db.dropCollection("telemetry")
    expect((await db.listCollections().toArray()).map((c) => c.name)).not.toContain("telemetry")
  })

  test("the seed is the same on every launch", async () => {
    const first = await createDemoStore()
      .db("shop")
      .collection("products")
      .find()
      .sort({ sku: 1 })
      .toArray()
    const second = await createDemoStore()
      .db("shop")
      .collection("products")
      .find()
      .sort({ sku: 1 })
      .toArray()
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })
})
