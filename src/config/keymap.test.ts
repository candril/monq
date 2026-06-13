import { describe, expect, test } from "bun:test"
import { buildKeymap } from "./keymap"

describe("default keymap", () => {
  test("includes QoL navigation shortcuts", () => {
    const keymap = buildKeymap()

    expect(keymap["nav.first_row"][0]).toMatchObject({ name: "g" })
    expect(keymap["nav.last_row"][0]).toMatchObject({ name: "g", shift: true })
    expect(keymap["nav.center_row"][0]).toMatchObject({ name: "z" })
    expect(keymap["sidebar.blur"][0]).toMatchObject({ name: "l", ctrl: true })
    expect(keymap["help.shortcuts"][0]).toMatchObject({ name: "?" })
  })

  test("keeps f first while adding star as filter-value alias", () => {
    const keymap = buildKeymap()

    expect(keymap["doc.filter_value"][0]).toMatchObject({ name: "f" })
    expect(keymap["doc.filter_value"].some((combo) => combo.name === "*")).toBe(true)
  })
})
