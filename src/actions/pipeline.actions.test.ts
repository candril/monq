import { describe, test, expect } from "bun:test"
import { ObjectId } from "mongodb"
import { EJSON } from "bson"
import { _buildPipelineTemplate } from "./pipeline"

const emptySchema = new Map()

/** Strip comment/blank header lines and return the raw JSON body */
function extractJsonBody(template: string): string {
  const lines = template.split("\n")
  const firstJson = lines.findIndex((l) => l.trimStart().startsWith("{"))
  return lines.slice(firstJson).join("\n")
}

describe("_buildPipelineTemplate — EJSON serialization", () => {
  test("ObjectId in live pipeline stages is serialized as $oid, not {}", () => {
    // regression: JSON.stringify turns ObjectId into {} in the written file;
    // buildTemplate must use EJSON.stringify so ObjectId round-trips correctly
    const id = new ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa")
    const pipeline = [{ $match: { _id: id } }, { $sort: { _id: -1 } }]

    const output = _buildPipelineTemplate(
      "users",
      "mydb",
      "", // no existing source — triggers the live-pipeline serialization path
      pipeline,
      "",
      emptySchema,
      null,
      -1,
    )

    // Must not contain the broken empty-object form
    expect(output).not.toContain('"_id": {}')

    // Must contain EJSON extended type
    expect(output).toContain("$oid")
    expect(output).toContain("aaaaaaaaaaaaaaaaaaaaaaaa")

    // The JSON body must be parseable and round-trip to a real ObjectId
    const parsed = EJSON.parse(extractJsonBody(output))
    const matchId = parsed.pipeline[0].$match._id
    expect(typeof matchId.toHexString).toBe("function")
    expect(matchId.toHexString()).toBe("aaaaaaaaaaaaaaaaaaaaaaaa")
  })

  test("ObjectId in simple query filter is serialized as $oid in the template", () => {
    // regression: simple query _id:ObjectId(...) was parsed to a real ObjectId
    // but then JSON.stringify'd to {} when building the pipeline file
    const output = _buildPipelineTemplate(
      "users",
      "mydb",
      "", // no existing source
      [], // no live pipeline — triggers the simple-query-parse path
      "_id:ObjectId(aaaaaaaaaaaaaaaaaaaaaaaa)",
      emptySchema,
      null,
      -1,
    )

    expect(output).not.toContain('"_id": {}')
    expect(output).toContain("$oid")
    expect(output).toContain("aaaaaaaaaaaaaaaaaaaaaaaa")

    const parsed = EJSON.parse(extractJsonBody(output))
    const matchId = parsed.pipeline[0].$match._id
    expect(typeof matchId.toHexString).toBe("function")
    expect(matchId.toHexString()).toBe("aaaaaaaaaaaaaaaaaaaaaaaa")
  })

  test("existing pipelineSource is passed through unchanged (no re-serialization)", () => {
    const existingSource = `{ "pipeline": [{ "$match": { "status": "active" } }] }\n`
    const output = _buildPipelineTemplate(
      "users",
      "mydb",
      existingSource,
      [],
      "",
      emptySchema,
      null,
      -1,
    )
    // The existing JSON body is preserved verbatim (only header is prepended)
    expect(output).toContain('"status": "active"')
  })
})
