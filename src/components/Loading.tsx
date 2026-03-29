import { useState, useEffect } from "react"
import { theme } from "../theme"

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

// Big spinner — wide braille arc, visually larger than the inline spinner
const BIG_SPINNER_FRAMES = ["⣾⣿⣿", "⣽⣿⣿", "⣻⣿⣿", "⢿⣿⣿", "⡿⣿⣿", "⣟⣿⣿", "⣯⣿⣿", "⣷⣿⣿"]

interface LoadingProps {
  message?: string
}

/** Full-screen loading with big spinner above and message below */
export function Loading({ message = "Loading..." }: LoadingProps) {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % BIG_SPINNER_FRAMES.length)
    }, 120)
    return () => clearInterval(timer)
  }, [])

  const spinChar = BIG_SPINNER_FRAMES[frame]!

  return (
    <box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center">
      <box flexDirection="column" alignItems="center">
        <text>
          <span fg={theme.primary}>{spinChar}</span>
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
