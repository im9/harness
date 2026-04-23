import { useCallback, useState } from 'react'

export type Theme = 'light' | 'dark'

export const STORAGE_KEY = 'harness-theme'

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

function prefersLight(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches
}

/**
 * Precedence: localStorage > prefers-color-scheme > dark.
 * Dark is the ADR 003 default (reduced glare during long trading sessions).
 *
 * Not used at runtime by <html>-class hydration — index.html already runs an
 * inline version of this policy before React mounts. Exported for tests and
 * for any future non-browser caller (SSR, storybook, etc.).
 */
export function resolveInitialTheme(): Theme {
  const stored = readStored()
  if (stored) return stored
  return prefersLight() ? 'light' : 'dark'
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

/**
 * Theme state + setter. Reads the initial state from <html>'s classList,
 * which the inline script in index.html synchronises before React mounts;
 * this keeps the hook consistent with the pre-hydration paint and avoids
 * re-running the precedence logic twice.
 */
export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document === 'undefined') return 'dark'
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  })

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    applyTheme(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Private browsing or site-data policy can disable storage. The visual
      // toggle still applies for this session; persistence is best-effort.
    }
  }, [])

  return [theme, setTheme]
}
