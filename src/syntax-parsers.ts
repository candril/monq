/**
 * Tree-sitter parser registration for syntax highlighting.
 * OpenTUI bundles parsers for: javascript, typescript, markdown, zig.
 * We add JSON for document preview.
 */

import { addDefaultParsers, type FiletypeParserOptions } from "@opentui/core"

const jsonParser: FiletypeParserOptions = {
  filetype: "json",
  wasm: "https://github.com/tree-sitter/tree-sitter-json/releases/download/v0.24.8/tree-sitter-json.wasm",
  queries: {
    highlights: [
      "https://raw.githubusercontent.com/nvim-treesitter/nvim-treesitter/refs/heads/master/queries/json/highlights.scm",
    ],
  },
}

export function registerSyntaxParsers(): void {
  addDefaultParsers([jsonParser])
}
