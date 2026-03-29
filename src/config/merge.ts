/**
 * Config merger.
 * Takes a validated UserConfig and produces a ResolvedConfig by merging
 * user overrides onto the built-in defaults.
 */

import type { UserConfig, ResolvedConfig, ThemeConfig } from "./types"
import { buildKeymap } from "./keymap"
import { validateConfig } from "./validate"
import { THEME_PRESETS } from "../themes/index"

/**
 * Merge user config + validation warnings into a ResolvedConfig.
 * Call validateConfig() before this to collect warnings — or pass them in directly.
 */
export function mergeConfig(user: UserConfig, warnings: string[] = []): ResolvedConfig {
  // theme_preset: validate and record (used as reset target; actual theme application
  // happens in index.tsx where we can import buildTheme / setTheme without a cycle)
  let configThemeId: string | null = null
  if (user.themePreset) {
    const known = THEME_PRESETS.find((p) => p.id === user.themePreset)
    if (known) {
      configThemeId = known.id
    } else {
      warnings.push(`config: unknown theme_preset "${user.themePreset}" — ignored`)
    }
  }

  // Theme token overrides: only carry over tokens that are valid hex
  const validTheme: Partial<ThemeConfig> = {}
  if (user.theme) {
    const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
    for (const [key, value] of Object.entries(user.theme)) {
      if (typeof value === "string" && HEX_RE.test(value)) {
        validTheme[key as keyof ThemeConfig] = value
      }
    }
  }

  // Keys: build keymap (invalid action names are simply absent from keys config after validation)
  const keymap = buildKeymap(user.keys ?? {})

  return {
    configThemeId,
    theme: validTheme,
    keymap,
    warnings,
  }
}

/**
 * Convenience: load, validate, and merge in one step.
 * Used by index.tsx.
 */
export function resolveConfig(user: UserConfig | null): ResolvedConfig {
  if (!user) {
    return { configThemeId: null, theme: {}, keymap: buildKeymap(), warnings: [] }
  }
  const warnings = validateConfig(user)
  return mergeConfig(user, warnings)
}
