import { describe, expect, test } from "bun:test"
import { createInitialState } from "../../state"
import { uiReducer } from "./ui"

describe("shortcut help", () => {
  test("opens and closes", () => {
    const open = uiReducer(createInitialState(), { type: "OPEN_SHORTCUT_HELP" })!
    expect(open.shortcutHelpVisible).toBe(true)

    const closed = uiReducer(open, { type: "CLOSE_SHORTCUT_HELP" })!
    expect(closed.shortcutHelpVisible).toBe(false)
  })
})
