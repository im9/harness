import { useEffect, useMemo, useState } from 'react'
import { getDashboard, subscribeDashboard } from './dashboard-client'
import type { DashboardPayload, Timeframe } from './dashboard-types'

export interface UseDashboardState {
  data: DashboardPayload | null
  loading: boolean
  error: Error | null
}

export interface UseDashboardOptions {
  timeframes?: Record<string, Timeframe>
  // Which tracked instrument is currently focused as primary (ADR 004
  // swap mechanics). `undefined` hands the choice to the backend's
  // default — used on initial page load before any swap has happened.
  primarySymbol?: string
}

// Push-based data flow: one REST fetch for initial paint, then a
// subscription for live updates (SSE on the real backend, simulated
// on the mock). When `timeframes` or `primarySymbol` changes, the
// hook reopens the subscription so the server re-projects the payload
// with the new focus — same EventSource + query-param pattern the
// real backend will use.
export function useDashboard(
  options: UseDashboardOptions = {},
): UseDashboardState {
  const { timeframes, primarySymbol } = options
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [error, setError] = useState<Error | null>(null)

  // JSON key so effect rerun only when the actual map contents change,
  // not when the parent re-renders with a fresh object literal. Parents
  // that already memoize can pass the same reference and pay no cost.
  const tfKey = useMemo(() => JSON.stringify(timeframes ?? {}), [timeframes])

  useEffect(() => {
    let cancelled = false
    const tfs = JSON.parse(tfKey) as Record<string, Timeframe>

    getDashboard({ timeframes: tfs, primarySymbol })
      .then((payload) => {
        if (!cancelled) {
          setData(payload)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      })

    const unsubscribe = subscribeDashboard({
      timeframes: tfs,
      primarySymbol,
      onData: (payload) => {
        if (!cancelled) {
          setData(payload)
          setError(null)
        }
      },
      onError: (err) => {
        if (!cancelled) setError(err)
      },
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [tfKey, primarySymbol])

  return { data, loading: data === null && error === null, error }
}
