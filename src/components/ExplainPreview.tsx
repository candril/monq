/**
 * ExplainPreview — ASCII-drawn execution plan in the preview pane.
 * Renders the explain output as a tree with color-coded scan types and stats.
 */

import { useRef, useEffect, useMemo } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { Document } from "mongodb"
import type { PreviewPosition } from "../types"
import { theme } from "../theme"

interface ExplainPreviewProps {
  result: Document | null
  loading: boolean
  position: PreviewPosition
  scrollOffset: number
  collectionName?: string
}

// ── Plan tree extraction ──────────────────────────────────────────────────────

interface PlanNode {
  stage: string
  indexName?: string
  keyPattern?: Record<string, unknown>
  direction?: string
  filter?: Record<string, unknown>
  nReturned?: number
  docsExamined?: number
  keysExamined?: number
  children: PlanNode[]
}

function extractPlanTree(plan: Document): PlanNode | null {
  if (!plan || typeof plan !== "object") return null

  const stages =
    (plan as Record<string, Document>).executionStats?.executionStages ??
    (plan as Record<string, Document>).queryPlanner?.winningPlan
  if (!stages) return null

  return walkStage(stages as Document)
}

function walkStage(stage: Document): PlanNode {
  const s = stage as Record<string, unknown>
  const node: PlanNode = {
    stage: (s.stage as string) ?? "?",
    children: [],
  }

  if (s.indexName) node.indexName = s.indexName as string
  if (s.keyPattern) node.keyPattern = s.keyPattern as Record<string, unknown>
  if (s.direction) node.direction = s.direction as string
  if (s.filter) node.filter = s.filter as Record<string, unknown>
  if (typeof s.nReturned === "number") node.nReturned = s.nReturned as number
  if (typeof s.docsExamined === "number") node.docsExamined = s.docsExamined as number
  if (typeof s.keysExamined === "number") node.keysExamined = s.keysExamined as number

  if (s.inputStage) {
    node.children.push(walkStage(s.inputStage as Document))
  }
  if (Array.isArray(s.inputStages)) {
    for (const child of s.inputStages as Document[]) {
      node.children.push(walkStage(child))
    }
  }
  return node
}

// ── Stats extraction ──────────────────────────────────────────────────────────

interface ExplainStats {
  nReturned: number
  totalDocsExamined: number
  totalKeysExamined: number
  executionTimeMillis: number
  rejectedPlans: number
}

function extractStats(plan: Document): ExplainStats | null {
  const p = plan as Record<string, unknown>
  const exec = p.executionStats as Record<string, unknown> | undefined
  if (!exec) return null

  const qp = p.queryPlanner as Record<string, unknown> | undefined
  const rejected = Array.isArray(qp?.rejectedPlans) ? (qp!.rejectedPlans as unknown[]).length : 0

  return {
    nReturned: (exec.nReturned as number) ?? 0,
    totalDocsExamined: (exec.totalDocsExamined as number) ?? 0,
    totalKeysExamined: (exec.totalKeysExamined as number) ?? 0,
    executionTimeMillis: (exec.executionTimeMillis as number) ?? 0,
    rejectedPlans: rejected,
  }
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function stageColor(stage: string): string {
  if (stage === "COLLSCAN") return theme.error
  if (stage === "IXSCAN") return theme.success
  return theme.primary
}

function timeColor(ms: number): string {
  if (ms >= 100) return theme.error
  if (ms >= 10) return theme.warning
  return theme.success
}

function fmt(n: number): string {
  return n.toLocaleString("en-US")
}

// ── Line builder ──────────────────────────────────────────────────────────────

interface Line {
  segments: Array<{ text: string; color: string }>
}

function line(...segments: Array<{ text: string; color: string }>): Line {
  return { segments }
}

function seg(text: string, color: string = theme.text) {
  return { text, color }
}

function buildPlanLines(node: PlanNode, prefix: string, isLast: boolean, isRoot: boolean): Line[] {
  const lines: Line[] = []

  const connector = isRoot ? "  " : isLast ? "  └─ " : "  ├─ "
  const childPrefix = isRoot ? "  " : prefix + (isLast ? "     " : "  │  ")

  // Stage line: STAGE  indexName
  const stageParts: Array<{ text: string; color: string }> = [
    seg(prefix + connector, theme.textMuted),
    seg(node.stage, stageColor(node.stage)),
  ]
  if (node.indexName) {
    stageParts.push(seg("  ", theme.text))
    stageParts.push(seg(node.indexName, theme.secondary))
  }
  lines.push(line(...stageParts))

  // Detail lines below the stage
  const details: Array<{ label: string; value: string; valueColor?: string }> = []
  if (node.keyPattern) {
    details.push({ label: "key", value: JSON.stringify(node.keyPattern) })
  }
  if (node.direction) {
    details.push({ label: "direction", value: node.direction })
  }

  const hasChildren = node.children.length > 0
  for (let d = 0; d < details.length; d++) {
    const isLastDetail = d === details.length - 1 && !hasChildren
    const detailConnector = isLastDetail ? "  └─ " : "  ├─ "
    lines.push(line(
      seg(childPrefix + detailConnector, theme.textMuted),
      seg(details[d].label + ": ", theme.textMuted),
      seg(details[d].value, details[d].valueColor ?? theme.textDim),
    ))
  }

  // Children
  for (let i = 0; i < node.children.length; i++) {
    const childLines = buildPlanLines(node.children[i], childPrefix, i === node.children.length - 1, false)
    lines.push(...childLines)
  }

  return lines
}

function buildStatsLines(stats: ExplainStats): Line[] {
  const lines: Line[] = []
  const ratio = stats.nReturned > 0 ? stats.totalDocsExamined / stats.nReturned : 0
  const ratioStr = ratio.toFixed(1) + "x"
  const ratioHigh = ratio > 10
  const ratioColor = ratioHigh ? theme.warning : theme.success

  lines.push(line(seg("")))
  lines.push(line(
    seg("  ── ", theme.textMuted),
    seg("Stats", theme.textDim),
    seg(" ─".repeat(16), theme.textMuted),
  ))
  lines.push(line(seg("")))

  // Fixed-width label column (18 chars) for alignment
  const W = 18
  const row = (label: string, value: string, color?: string) => {
    const padded = ("  " + label).padEnd(W)
    lines.push(line(seg(padded, theme.textMuted), seg(value, color ?? theme.text)))
  }

  row("returned", fmt(stats.nReturned))
  row("examined", fmt(stats.totalDocsExamined))
  row("keys", fmt(stats.totalKeysExamined))
  row("time", stats.executionTimeMillis + " ms", timeColor(stats.executionTimeMillis))
  row("ratio", ratioStr, ratioColor)

  if (ratioHigh) {
    lines.push(line(seg("")))
    lines.push(line(seg("  ! ", theme.warning), seg("high examine/return ratio — consider adding an index", theme.warning)))
  }

  if (stats.rejectedPlans > 0) {
    row("rejected plans", String(stats.rejectedPlans), theme.textDim)
  }

  return lines
}

function buildAllLines(result: Document): Line[] {
  const lines: Line[] = []

  const tree = extractPlanTree(result)
  if (tree) {
    lines.push(...buildPlanLines(tree, "", true, true))
  }

  const stats = extractStats(result)
  if (stats) {
    lines.push(...buildStatsLines(stats))
  }

  if (!tree && !stats) {
    lines.push(line(seg("  Could not parse explain output", theme.warning)))
  }

  return lines
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ExplainPreview({ result, loading, position, scrollOffset, collectionName }: ExplainPreviewProps) {
  const scrollRef = useRef<ScrollBoxRenderable>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo(scrollOffset)
    }
  }, [scrollOffset])

  const lines = useMemo(() => {
    if (result) return buildAllLines(result)
    if (loading) return []
    return [line(seg("  Press ", theme.textMuted), seg("x", theme.text), seg(" to run explain on the current query", theme.textMuted))]
  }, [result, loading])

  if (!position) return null

  const isRight = position === "right"

  return (
    <box
      width={isRight ? "50%" : "100%"}
      height={isRight ? "100%" : "50%"}
      flexDirection="column"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      border={[isRight ? "left" : "top"] as any}
      borderColor={theme.border}
      overflow="hidden"
    >
      <box paddingX={1} height={1}>
        <text>
          <span fg={theme.primary}>Explain</span>
          {collectionName && <span fg={theme.textMuted}> — {collectionName}</span>}
          {loading && <span fg={theme.textDim}>  loading…</span>}
        </text>
      </box>
      <scrollbox ref={scrollRef} flexGrow={1}>
        <box flexDirection="column" paddingX={1} paddingTop={1}>
          {lines.map((ln, i) => (
            <text key={i}>
              {ln.segments.map((s, j) => (
                <span key={j} fg={s.color}>
                  {s.text}
                </span>
              ))}
            </text>
          ))}
        </box>
      </scrollbox>
    </box>
  )
}
