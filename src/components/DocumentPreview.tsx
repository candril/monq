/**
 * Document preview panel — shows selected document as syntax-highlighted JSON.
 * Uses OpenTUI's <code> component with filetype="json".
 * Toggled with p, position cycled with P. Scroll with Ctrl+D/U.
 */

import { useRef, useEffect, useMemo } from "react"
import { SyntaxStyle, RGBA, type ScrollBoxRenderable } from "@opentui/core"
import type { Document } from "mongodb"
import type { PreviewPosition } from "../types"
import { theme } from "../theme"
import { serializeDocumentRelaxed } from "../utils/document"

// JSON syntax style matching our Tokyo Night theme
const jsonSyntaxStyle = SyntaxStyle.fromStyles({
  string: { fg: RGBA.fromHex(theme.jsonString) },
  number: { fg: RGBA.fromHex(theme.jsonNumber) },
  boolean: { fg: RGBA.fromHex(theme.jsonBoolean) },
  constant: { fg: RGBA.fromHex(theme.jsonNull) },
  property: { fg: RGBA.fromHex(theme.jsonKey) },
  punctuation: { fg: RGBA.fromHex(theme.jsonBracket) },
  "punctuation.bracket": { fg: RGBA.fromHex(theme.jsonBracket) },
  "punctuation.delimiter": { fg: RGBA.fromHex(theme.textDim) },
  default: { fg: RGBA.fromHex(theme.text) },
})

interface DocumentPreviewProps {
  document: Document | null
  position: PreviewPosition
  scrollOffset: number
}

export function DocumentPreview({ document, position, scrollOffset }: DocumentPreviewProps) {
  const scrollRef = useRef<ScrollBoxRenderable>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo(scrollOffset)
    }
  }, [scrollOffset])

  const json = useMemo(() => (document ? serializeDocumentRelaxed(document) : ""), [document])

  if (!position || !document) {
    return null
  }

  const isRight = position === "right"

  return (
    <box
      width={isRight ? "50%" : "100%"}
      height={isRight ? "100%" : "50%"}
      flexDirection="column"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OpenTUI border prop not typed
      border={[isRight ? "left" : "top"] as any}
      borderColor={theme.border}
      overflow="hidden"
    >
      <scrollbox ref={scrollRef} flexGrow={1}>
        <code
          {...({
            content: json,
            filetype: "json",
            syntaxStyle: jsonSyntaxStyle,
            drawUnstyledText: false,
            conceal: false,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OpenTUI code props not typed
          } as any)}
        />
      </scrollbox>
    </box>
  )
}
