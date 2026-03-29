import { describe, test, expect } from "bun:test"
import { ERROR_COMMENT_RE } from "./editor"

describe("ERROR_COMMENT_RE", () => {
  test("matches a single error comment line", () => {
    // arrange
    const content = "// !! PARSE ERROR: unexpected token\n\n{}"

    // act
    const match = content.match(ERROR_COMMENT_RE)

    // assert
    expect(match).not.toBeNull()
  })

  test("matches multi-line error comment block", () => {
    // arrange
    const content = "// !! PARSE ERROR: unexpected token\n// Fix the JSON below.\n\n{}"

    // act
    const stripped = content.replace(ERROR_COMMENT_RE, "")

    // assert
    expect(stripped).toBe("{}")
  })

  test("does not match regular comment lines", () => {
    // arrange
    const content = "// just a normal comment\n{}"

    // act
    const match = content.match(ERROR_COMMENT_RE)

    // assert
    expect(match).toBeNull()
  })

  test("strips error block leaving body intact", () => {
    // arrange
    const body = '{\n  "name": "Alice"\n}'
    const content = `// !! PARSE ERROR: bad token\n// Fix below.\n\n${body}`

    // act
    const stripped = content.replace(ERROR_COMMENT_RE, "")

    // assert
    expect(stripped).toBe(body)
  })

  test("no match when no error comment present", () => {
    expect("{}".match(ERROR_COMMENT_RE)).toBeNull()
  })
})
