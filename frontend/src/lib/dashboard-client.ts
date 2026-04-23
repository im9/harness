import type { DashboardPayload, Timeframe } from './dashboard-types'
import { getMockBackend } from './mock-backend'

// Client boundary for dashboard data. Push-based by design so the UI
// receives engine updates as they happen rather than polling. Today
// this is a thin wrapper over the in-memory mock backend; when the
// real backend lands (ADR 004 `GET /api/dashboard` + SSE stream at
// `/api/dashboard/stream`) only this file changes — consumers
// (`useDashboard`, tests) keep the same contract.

const SIMULATED_LATENCY_MS = 20

// Mock emits a snapshot at this cadence to simulate the SSE stream
// that the real backend will push on engine state change. This is
// *internal* to the mock — the frontend subscribes and does not poll.
const MOCK_STREAM_INTERVAL_MS = 1000

export interface FetchOptions {
  timeframes?: Record<string, Timeframe>
}

export async function getDashboard(options: FetchOptions = {}): Promise<DashboardPayload> {
  await new Promise((resolve) => setTimeout(resolve, SIMULATED_LATENCY_MS))
  return getMockBackend().getSnapshot({ timeframes: options.timeframes })
}

export interface DashboardSubscriber {
  onData: (payload: DashboardPayload) => void
  onError?: (err: Error) => void
  timeframes?: Record<string, Timeframe>
}

export function subscribeDashboard(subscriber: DashboardSubscriber): () => void {
  // Real implementation will open an EventSource against the backend
  // stream endpoint and forward `message` events / `error` events to
  // the subscriber. When `timeframes` changes, the caller should close
  // the current subscription and open a new one — matching the real
  // EventSource + query-param pattern where the URL fully encodes the
  // server's per-symbol aggregation choice.
  let cancelled = false
  const timer = setInterval(() => {
    if (cancelled) return
    try {
      subscriber.onData(
        getMockBackend().getSnapshot({ timeframes: subscriber.timeframes }),
      )
    } catch (err) {
      subscriber.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  }, MOCK_STREAM_INTERVAL_MS)
  return () => {
    cancelled = true
    clearInterval(timer)
  }
}
