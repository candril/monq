/**
 * Hook: unified theme application.
 *
 * Wraps the mutable theme singleton update and React re-render trigger
 * into a single function. This eliminates the footgun of calling
 * setTheme() without bumping themeVersion.
 *
 * Returns `applyTheme(t: Theme)` — call it instead of setTheme() + setThemeVersion().
 */

import { useState, useCallback } from "react"
import { type Theme, setTheme } from "../theme"

export function useApplyTheme() {
  // Bump this to force a full re-render so components re-read the updated theme singleton
  const [themeVersion, setThemeVersion] = useState(0)

  const applyTheme = useCallback((t: Theme) => {
    setTheme(t)
    setThemeVersion((v) => v + 1)
  }, [])

  return { applyTheme, themeVersion }
}
