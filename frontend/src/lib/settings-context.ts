// Context shape + hooks for operator settings (ADR 009 Phase A).
// Provider lives in `settings-provider.tsx` — split here so that the
// hooks-only module passes react-refresh's "only-export-components"
// rule when combined with HMR.

import { createContext, useContext } from 'react'
import { DEFAULT_DISPLAY_TIMEZONE } from './display-timezone'
import type { SettingsDocument } from './settings-client'

export type SettingsStatus = 'loading' | 'ready' | 'error'

export interface SettingsContextValue {
  settings: SettingsDocument | null
  status: SettingsStatus
  // Persists `next` and updates context state from the server's echo.
  // Throws on failure so the caller can render field-level errors.
  save: (next: SettingsDocument) => Promise<SettingsDocument>
  // Re-fetches from the server. Useful when the operator has been
  // away long enough that the cached value may have drifted.
  refresh: () => Promise<void>
}

export const SettingsContext = createContext<SettingsContextValue | null>(null)

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (ctx === null) {
    throw new Error('useSettings must be called inside a <SettingsProvider>')
  }
  return ctx
}

// Convenience hook for the most-read field. Returns the default
// (Asia/Tokyo) when no document has loaded yet so callers
// (PriceChart, NewsFeed) can render before the settings probe
// resolves without flickering through an empty/invalid timezone.
// Tolerates being called outside a SettingsProvider so the existing
// dashboard component tests (which render bare) keep passing.
export function useDisplayTimezone(): string {
  const ctx = useContext(SettingsContext)
  return ctx?.settings?.localization.displayTimezone ?? DEFAULT_DISPLAY_TIMEZONE
}
