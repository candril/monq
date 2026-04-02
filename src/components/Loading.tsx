import { useState, useEffect, useRef } from "react"
import { theme } from "../theme"

// Small spinner: 3-dot arc rotating clockwise through all 8 braille dots (full cell height)
const SPINNER_FRAMES = ["⠇", "⡆", "⣄", "⣠", "⢰", "⠸", "⠙", "⠋"]

// Braille dot bit values: dots 1-8 map to bits 0-7
// Layout per character:  1 4  /  2 5  /  3 6  /  7 8
const BRAILLE_BASE = 0x2800
const BRAILLE_FULL = 0xff
// Clockwise perimeter order: dot1, dot2, dot3, dot7, dot8, dot6, dot5, dot4
const DOT_BITS = [0x01, 0x02, 0x04, 0x40, 0x80, 0x20, 0x10, 0x08]
const NUM_DOTS = DOT_BITS.length

/** Build a braille char with one dot missing */
function brailleWithout(dotIndex: number): string {
  return String.fromCodePoint(BRAILLE_BASE + (BRAILLE_FULL ^ DOT_BITS[dotIndex % NUM_DOTS]!))
}

// Wave spinner: stagger [0, 3, 6] — missing dot sweeps left-to-right
const COLUMN_OFFSETS = [0, 3, 6]
const WAVE_FRAMES = Array.from({ length: NUM_DOTS }, (_, f) =>
  COLUMN_OFFSETS.map((offset) => brailleWithout(f + offset)).join(""),
)

/** Generate a random big-spinner frame (each column gets a random missing dot) */
function randomFrame(): string {
  return Array.from({ length: 3 }, () => brailleWithout(Math.floor(Math.random() * NUM_DOTS))).join(
    "",
  )
}

interface LoadingProps {
  message?: string
}

/** Full-screen loading with big spinner above and message below */
export function Loading({ message = "Loading..." }: LoadingProps) {
  const [display, setDisplay] = useState(WAVE_FRAMES[0]!)
  const tick = useRef(0)

  useEffect(() => {
    const timer = setInterval(() => {
      const t = tick.current++
      if (t < NUM_DOTS) {
        // First loop: deterministic wave animation
        setDisplay(WAVE_FRAMES[t % NUM_DOTS]!)
      } else {
        // After first loop: random frames
        setDisplay(randomFrame())
      }
    }, 120)
    return () => clearInterval(timer)
  }, [])

  return (
    <box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center">
      <box flexDirection="column" alignItems="center">
        <text>
          <span fg={theme.primary}>{display}</span>
        </text>
        <box marginTop={1}>
          <text>
            <span fg={theme.textDim}>{message}</span>
          </text>
        </box>
      </box>
    </box>
  )
}

/** Small inline spinner for header/status bar */
export function Spinner() {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length)
    }, 120)
    return () => clearInterval(timer)
  }, [])

  return <text fg={theme.primary}>{SPINNER_FRAMES[frame]}</text>
}
