/**
 * ExplainPreview — execution plan in the preview pane.
 * Each stage rendered as a bordered card, connected by arrows.
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

// ── Stage extraction ──────────────────────────────────────────────────────────

interface StageInfo {
  stage: string
  indexName?: string
  keyPattern?: Record<string, unknown>
  direction?: string
  filter?: Record<string, unknown>
  nReturned?: number
  executionTimeMillisEstimate?: number
  isMultiKey?: boolean
  memUsage?: number
  memLimit?: number
  sortPattern?: Record<string, unknown>
}

function parseStageNode(s: Record<string, unknown>): StageInfo {
  const info: StageInfo = { stage: (s.stage as string) ?? "?" }
  if (s.indexName) info.indexName = s.indexName as string
  if (s.keyPattern) info.keyPattern = s.keyPattern as Record<string, unknown>
  if (s.direction) info.direction = s.direction as string
  if (typeof s.nReturned === "number") info.nReturned = s.nReturned as number
  if (typeof s.executionTimeMillisEstimate === "number") info.executionTimeMillisEstimate = s.executionTimeMillisEstimate as number
  if (s.filter && typeof s.filter === "object") info.filter = s.filter as Record<string, unknown>
  if (typeof s.isMultiKey === "boolean") info.isMultiKey = s.isMultiKey as boolean
  if (typeof s.memUsage === "number") info.memUsage = s.memUsage as number
  if (typeof s.memLimit === "number") info.memLimit = s.memLimit as number
  if (s.sortPattern) info.sortPattern = s.sortPattern as Record<string, unknown>
  return info
}

function walkInputStages(root: Document): StageInfo[] {
  const stages: StageInfo[] = []
  let current: Document | null = root
  while (current) {
    const s = current as Record<string, unknown>
    stages.push(parseStageNode(s))
    current = (s.inputStage as Document | undefined) ?? null
  }
  return stages
}

function flattenStages(plan: Document): StageInfo[] {
  const p = plan as Record<string, Document>

  const execStages = p.executionStats?.executionStages
  if (execStages && typeof execStages === "object" && (execStages as Record<string, unknown>).stage) {
    return walkInputStages(execStages as Document)
  }

  if (Array.isArray(p.stages)) {
    const stages: StageInfo[] = []
    for (const entry of p.stages as Document[]) {
      const keys = Object.keys(entry)
      if ("$cursor" in entry) {
        const cursor = (entry as Record<string, Document>).$cursor
        const cursorExec = (cursor as Record<string, Document>)?.executionStats?.executionStages
        if (cursorExec) {
          stages.push(...walkInputStages(cursorExec as Document))
        } else {
          const wp = (cursor as Record<string, Document>)?.queryPlanner?.winningPlan
          if (wp) stages.push(...walkInputStages(wp as Document))
        }
      } else {
        const stageName = keys.find((k) => k.startsWith("$")) ?? keys[0] ?? "?"
        const stageData = (entry as Record<string, unknown>)[stageName]
        const info: StageInfo = { stage: stageName }
        if (typeof stageData === "object" && stageData !== null) {
          const sd = stageData as Record<string, unknown>
          if (typeof sd.nReturned === "number") info.nReturned = sd.nReturned as number
          if (typeof sd.executionTimeMillisEstimate === "number") info.executionTimeMillisEstimate = sd.executionTimeMillisEstimate as number
        }
        stages.push(info)
      }
    }
    return stages
  }

  const wp =
    (p.queryPlanner as Record<string, Document>)?.winningPlan?.queryPlan ??
    (p.queryPlanner as Record<string, Document>)?.winningPlan
  if (wp && typeof wp === "object" && (wp as Record<string, unknown>).stage) {
    return walkInputStages(wp as Document)
  }

  return []
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
  if (exec) {
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

  if (Array.isArray(p.stages)) {
    for (const entry of p.stages as Document[]) {
      if ("$cursor" in entry) {
        const cursor = (entry as Record<string, Document>).$cursor
        const cursorExec = (cursor as Record<string, unknown>)?.executionStats as Record<string, unknown> | undefined
        if (cursorExec) {
          const qp = (cursor as Record<string, unknown>)?.queryPlanner as Record<string, unknown> | undefined
          const rejected = Array.isArray(qp?.rejectedPlans) ? (qp!.rejectedPlans as unknown[]).length : 0
          return {
            nReturned: (cursorExec.nReturned as number) ?? 0,
            totalDocsExamined: (cursorExec.totalDocsExamined as number) ?? 0,
            totalKeysExamined: (cursorExec.totalKeysExamined as number) ?? 0,
            executionTimeMillis: (cursorExec.executionTimeMillis as number) ?? 0,
            rejectedPlans: rejected,
          }
        }
      }
    }
  }

  return null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/** Extract top-level field names from a parsedQuery filter, skipping $ operators. */
function filterFields(filter: Record<string, unknown>): string[] {
  return Object.keys(filter).filter((k) => !k.startsWith("$"))
}

// ── Stage Card ────────────────────────────────────────────────────────────────

function StageCard({ stage }: { stage: StageInfo }) {
  const W = 14
  return (
    <box
      border
      borderStyle="rounded"
      borderColor={stageColor(stage.stage)}
      paddingX={1}
      marginX={2}
    >
      <box flexDirection="column">
        {/* Header: STAGE  INDEX_NAME */}
        <box flexDirection="row" gap={2}>
          <text>
            <span fg={stageColor(stage.stage)}><b>{stage.stage}</b></span>
          </text>
          {stage.indexName && (
            <text>
              <span fg={theme.secondary}>{stage.indexName}</span>
            </text>
          )}
        </box>

        {/* Per-stage stats */}
        {stage.nReturned !== undefined && (
          <box flexDirection="row">
            <text>
              <span fg={theme.textMuted}>{"returned".padEnd(W)}</span>
              <span fg={theme.text}>{fmt(stage.nReturned)}</span>
            </text>
            {stage.executionTimeMillisEstimate !== undefined && (
              <text>
                <span fg={theme.textMuted}>{"   "}</span>
                <span fg={timeColor(stage.executionTimeMillisEstimate)}>{stage.executionTimeMillisEstimate} ms</span>
              </text>
            )}
          </box>
        )}

        {/* Index key */}
        {stage.keyPattern && (
          <text>
            <span fg={theme.textMuted}>{"key".padEnd(W)}</span>
            <span fg={theme.textDim}>{JSON.stringify(stage.keyPattern)}</span>
          </text>
        )}

        {/* Direction */}
        {stage.direction && (
          <text>
            <span fg={theme.textMuted}>{"direction".padEnd(W)}</span>
            <span fg={theme.textDim}>{stage.direction}</span>
          </text>
        )}

        {/* Multi-key */}
        {stage.isMultiKey !== undefined && (
          <text>
            <span fg={theme.textMuted}>{"multi-key".padEnd(W)}</span>
            <span fg={theme.textDim}>{stage.isMultiKey ? "yes" : "no"}</span>
          </text>
        )}

        {/* COLLSCAN reason */}
        {stage.stage === "COLLSCAN" && stage.filter && filterFields(stage.filter).length > 0 && (
          <text>
            <span fg={theme.error}>{"no index on".padEnd(W)}</span>
            <span fg={theme.error}>{filterFields(stage.filter).join(", ")}</span>
          </text>
        )}
        {stage.stage === "COLLSCAN" && (!stage.filter || filterFields(stage.filter).length === 0) && (
          <text>
            <span fg={theme.error}>no index available for this query</span>
          </text>
        )}

        {/* SORT details */}
        {stage.stage === "SORT" && stage.sortPattern && (
          <text>
            <span fg={theme.textMuted}>{"sort".padEnd(W)}</span>
            <span fg={theme.textDim}>{JSON.stringify(stage.sortPattern)}</span>
          </text>
        )}
        {stage.stage === "SORT" && (
          <text>
            <span fg={theme.textMuted}>{"in-memory".padEnd(W)}</span>
            <span fg={theme.warning}>yes</span>
          </text>
        )}
      </box>
    </box>
  )
}

// ── Arrow connector ───────────────────────────────────────────────────────────

function Arrow() {
  return (
    <box flexDirection="column" alignItems="center" height={2}>
      <text>
        <span fg={theme.textMuted}>▲</span>
      </text>
      <text>
        <span fg={theme.textMuted}>│</span>
      </text>
    </box>
  )
}

// ── Summary ───────────────────────────────────────────────────────────────────

function Summary({ stats, stages }: { stats: ExplainStats; stages: StageInfo[] }) {
  const ratio = stats.nReturned > 0 ? stats.totalDocsExamined / stats.nReturned : 0
  const ratioStr = ratio.toFixed(1) + "x"
  const ratioHigh = ratio > 10
  const ratioColor = ratioHigh ? theme.warning : theme.success

  const ixscan = stages.find((s) => s.stage === "IXSCAN")
  const hasCollScan = stages.some((s) => s.stage === "COLLSCAN")
  const hasMemSort = stages.some((s) => s.stage === "SORT")

  const W = 18

  return (
    <box
      border
      borderStyle="single"
      borderColor={theme.border}
      paddingX={1}
      marginX={2}
      marginTop={1}
      flexDirection="column"
    >
      <text>
        <span fg={theme.textDim}>Summary</span>
      </text>
      <text>
        <span fg={theme.textMuted}>{"returned".padEnd(W)}</span>
        <span fg={theme.text}>{fmt(stats.nReturned)}</span>
      </text>
      <text>
        <span fg={theme.textMuted}>{"examined".padEnd(W)}</span>
        <span fg={theme.text}>{fmt(stats.totalDocsExamined)}</span>
      </text>
      <text>
        <span fg={theme.textMuted}>{"keys".padEnd(W)}</span>
        <span fg={theme.text}>{fmt(stats.totalKeysExamined)}</span>
      </text>
      <text>
        <span fg={theme.textMuted}>{"time".padEnd(W)}</span>
        <span fg={timeColor(stats.executionTimeMillis)}>{stats.executionTimeMillis} ms</span>
      </text>
      <text>
        <span fg={theme.textMuted}>{"ratio".padEnd(W)}</span>
        <span fg={ratioColor}>{ratioStr}</span>
      </text>
      {ixscan && (
        <text>
          <span fg={theme.textMuted}>{"index".padEnd(W)}</span>
          <span fg={theme.success}>{ixscan.indexName ?? "unknown"}</span>
          {ixscan.keyPattern && <span fg={theme.textDim}>{"  " + JSON.stringify(ixscan.keyPattern)}</span>}
        </text>
      )}
      {hasCollScan && !ixscan && (
        <text>
          <span fg={theme.textMuted}>{"index".padEnd(W)}</span>
          <span fg={theme.error}>none (COLLSCAN)</span>
        </text>
      )}
      {hasMemSort && (
        <text>
          <span fg={theme.textMuted}>{"in-memory sort".padEnd(W)}</span>
          <span fg={theme.warning}>yes</span>
        </text>
      )}
      {stats.rejectedPlans > 0 && (
        <text>
          <span fg={theme.textMuted}>{"rejected plans".padEnd(W)}</span>
          <span fg={theme.textDim}>{String(stats.rejectedPlans)}</span>
        </text>
      )}
      {ratioHigh && (
        <box marginTop={1}>
          <text>
            <span fg={theme.warning}>! high examine/return ratio -- consider adding an index</span>
          </text>
        </box>
      )}
    </box>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ExplainPreview({ result, loading, position, scrollOffset, collectionName }: ExplainPreviewProps) {
  const scrollRef = useRef<ScrollBoxRenderable>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo(scrollOffset)
    }
  }, [scrollOffset])

  const data = useMemo(() => {
    if (!result) return null
    return {
      stages: flattenStages(result),
      stats: extractStats(result),
    }
  }, [result])

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
          {collectionName && <span fg={theme.textMuted}> -- {collectionName}</span>}
          {loading && <span fg={theme.textDim}>  loading...</span>}
        </text>
      </box>
      <scrollbox ref={scrollRef} flexGrow={1}>
        <box flexDirection="column" paddingY={1}>
          {!data && !loading && (
            <box paddingX={2}>
              <text>
                <span fg={theme.textMuted}>Press </span>
                <span fg={theme.text}>x</span>
                <span fg={theme.textMuted}> to run explain on the current query</span>
              </text>
            </box>
          )}

          {data && data.stages.length === 0 && !data.stats && (
            <box paddingX={2}>
              <text>
                <span fg={theme.warning}>Could not parse explain output. </span>
                <span fg={theme.textMuted}>Press </span>
                <span fg={theme.text}>X</span>
                <span fg={theme.textMuted}> for raw JSON.</span>
              </text>
            </box>
          )}

          {data && data.stages.map((stage, i) => (
            <box key={i} flexDirection="column">
              <StageCard stage={stage} />
              {i < data.stages.length - 1 && <Arrow />}
            </box>
          ))}

          {data?.stats && <Summary stats={data.stats} stages={data?.stages ?? []} />}
        </box>
      </scrollbox>
    </box>
  )
}
