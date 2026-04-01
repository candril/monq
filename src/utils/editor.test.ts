import { describe, test, expect } from "bun:test"
import { ERROR_COMMENT_RE, stripComments, stripErrorComment } from "./editor"

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

describe("stripComments", () => {
  test("removes full-line comments", () => {
    const content = "// comment\n{}\n// another"
    expect(stripComments(content)).toBe("{}")
  })

  test("preserves inline content", () => {
    const content = '{ "url": "http://example.com" }'
    expect(stripComments(content)).toBe('{ "url": "http://example.com" }')
  })

  test("returns trimmed result", () => {
    const content = "// header\n\n  {}\n\n"
    expect(stripComments(content)).toBe("{}")
  })

  test("handles empty input", () => {
    expect(stripComments("// only comments")).toBe("")
  })

  test("strips multi-line header block", () => {
    const content = "// Monq — editing\n// Save to apply\n//\n\n{}"
    expect(stripComments(content)).toBe("{}")
  })
})

describe("stripErrorComment", () => {
  test("removes error comment block", () => {
    const content = "// !! PARSE ERROR: bad token\n// Fix the JSON below.\n\n{}"
    expect(stripErrorComment(content)).toBe("{}")
  })

  test("leaves content unchanged when no error comment", () => {
    const content = '{ "name": "Alice" }'
    expect(stripErrorComment(content)).toBe('{ "name": "Alice" }')
  })

  test("preserves regular comments", () => {
    const content = "// just a comment\n{}"
    expect(stripErrorComment(content)).toBe("// just a comment\n{}")
  })
})
