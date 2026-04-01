import { describe, test, expect } from "bun:test"
import { formatKeyHint } from "./keymap"

describe("formatKeyHint", () => {
  test("plain lowercase letter", () => {
    expect(formatKeyHint({ name: "e" })).toBe("e")
  })

  test("plain non-letter character", () => {
    expect(formatKeyHint({ name: "/" })).toBe("/")
    expect(formatKeyHint({ name: "[" })).toBe("[")
    expect(formatKeyHint({ name: "-" })).toBe("-")
  })

  test("special key name", () => {
    expect(formatKeyHint({ name: "backspace" })).toBe("backspace")
    expect(formatKeyHint({ name: "tab" })).toBe("tab")
  })

  test("shift + letter → uppercase, no prefix", () => {
    expect(formatKeyHint({ name: "d", shift: true })).toBe("D")
    expect(formatKeyHint({ name: "y", shift: true })).toBe("Y")
    expect(formatKeyHint({ name: "x", shift: true })).toBe("X")
    expect(formatKeyHint({ name: "f", shift: true })).toBe("F")
    expect(formatKeyHint({ name: "p", shift: true })).toBe("P")
    expect(formatKeyHint({ name: "i", shift: true })).toBe("I")
  })

  test("ctrl + letter → Ctrl+<lowercase>", () => {
    expect(formatKeyHint({ name: "p", ctrl: true })).toBe("Ctrl+p")
    expect(formatKeyHint({ name: "f", ctrl: true })).toBe("Ctrl+f")
    expect(formatKeyHint({ name: "a", ctrl: true })).toBe("Ctrl+a")
    expect(formatKeyHint({ name: "e", ctrl: true })).toBe("Ctrl+e")
    expect(formatKeyHint({ name: "d", ctrl: true })).toBe("Ctrl+d")
    expect(formatKeyHint({ name: "u", ctrl: true })).toBe("Ctrl+u")
  })

  test("ctrl + shift + letter → Ctrl+Shift+<lowercase>", () => {
    expect(formatKeyHint({ name: "a", ctrl: true, shift: true })).toBe("Ctrl+Shift+a")
  })

  test("alt + letter → Alt+<lowercase>", () => {
    expect(formatKeyHint({ name: "f", alt: true })).toBe("Alt+f")
  })

  test("undefined → empty string", () => {
    expect(formatKeyHint(undefined)).toBe("")
  })
})
