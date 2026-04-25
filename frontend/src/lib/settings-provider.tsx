// SettingsProvider — loads operator settings once on mount and
// publishes them (plus a save action) through SettingsContext.
//
// Why a context: ADR 009 Phase A only carries the display timezone,
// but the surface grows to hold rule overlays / provider config /
// notification toggles. Reading the document via context keeps the
// access pattern uniform as panels land — components do not need
// per-field props from the dashboard root.

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  SettingsContext,
  type SettingsContextValue,
  type SettingsStatus,
} from './settings-context'
import {
  getSettings,
  putSettings,
  type SettingsDocument,
} from './settings-client'

// Synchronous default document so the loading frame doesn't read as
// `null` to consumers. Matches the backend's `_defaults()` so that an
// operator booting fresh sees their intended language (`ja`) and zone
// (`Asia/Tokyo`) immediately rather than the i18n fallback.
const DEFAULT_DOCUMENT: SettingsDocument = {
  localization: { displayTimezone: 'Asia/Tokyo', language: 'ja' },
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SettingsDocument | null>(
    DEFAULT_DOCUMENT,
  )
  const [status, setStatus] = useState<SettingsStatus>('loading')

  useEffect(() => {
    // Mount-time fetch of the operator's persisted document. Inlined
    // (rather than calling a memoised loader) so the only synchronous
    // setState lives outside the effect — the effect itself only
    // schedules the async fetch and updates state in its callbacks.
    let cancelled = false
    const probe = async () => {
      try {
        const doc = await getSettings()
        if (!cancelled) {
          setSettings(doc)
          setStatus('ready')
        }
      } catch {
        // A failed fetch (network glitch, 401 before the auth probe
        // settles) must not freeze the UI in `loading` — the rest of
        // the app reads the timezone via `useDisplayTimezone`, which
        // falls back to the default when no document is loaded.
        if (!cancelled) setStatus('error')
      }
    }
    void probe()
    return () => {
      cancelled = true
    }
  }, [])

  const refresh = useCallback(async () => {
    setStatus('loading')
    try {
      const doc = await getSettings()
      setSettings(doc)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [])

  const save = useCallback(
    async (next: SettingsDocument): Promise<SettingsDocument> => {
      const persisted = await putSettings(next)
      setSettings(persisted)
      setStatus('ready')
      return persisted
    },
    [],
  )

  const value: SettingsContextValue = { settings, status, save, refresh }
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}
