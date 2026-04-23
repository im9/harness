import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardPayload } from './dashboard-types'
import type { DashboardSubscriber } from './dashboard-client'

const { getDashboardMock, subscribeDashboardMock } = vi.hoisted(() => ({
  getDashboardMock: vi.fn(),
  subscribeDashboardMock: vi.fn(),
}))

vi.mock('./dashboard-client', () => ({
  getDashboard: getDashboardMock,
  subscribeDashboard: subscribeDashboardMock,
}))

import { useDashboard } from './use-dashboard'

function makePayload(tag: string): DashboardPayload {
  // Minimal distinct payloads so consecutive emits are distinguishable
  // by a marker value (here: the instrument's displayName).
  return {
    rule: {
      used: 0,
      cap: 1,
      capReached: false,
      cooldownActive: false,
      cooldownUntil: null,
      quoteCurrency: 'USD',
    },
    markets: [],
    primary: {
      instrument: {
        symbol: 'FUT-A',
        displayName: tag,
        tickSize: 0.25,
        tickValue: 5,
        quoteCurrency: 'USD',
      },
      state: 'HOLD',
      setup: null,
      lastPrice: 0,
      lastPriceAt: '2026-04-23T09:45:00Z',
      macro: null,
      bars: [],
      indicators: [],
    },
    watchlist: [],
    news: [],
  }
}

beforeEach(() => {
  getDashboardMock.mockReset()
  subscribeDashboardMock.mockReset()
})

afterEach(() => {
  getDashboardMock.mockReset()
  subscribeDashboardMock.mockReset()
})

describe('useDashboard', () => {
  it('starts loading and surfaces the initial REST payload', async () => {
    getDashboardMock.mockResolvedValue(makePayload('initial'))
    subscribeDashboardMock.mockReturnValue(() => {})

    const { result } = renderHook(() => useDashboard())

    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()

    await waitFor(() => {
      expect(result.current.data?.primary.instrument.displayName).toBe('initial')
    })
    expect(result.current.loading).toBe(false)
  })

  it('applies stream pushes after the initial fetch', async () => {
    getDashboardMock.mockResolvedValue(makePayload('initial'))
    let captured: DashboardSubscriber | null = null
    subscribeDashboardMock.mockImplementation((subscriber: DashboardSubscriber) => {
      captured = subscriber
      return () => {}
    })

    const { result } = renderHook(() => useDashboard())

    await waitFor(() => {
      expect(result.current.data?.primary.instrument.displayName).toBe('initial')
    })

    // Simulate the SSE stream delivering a newer payload. Pushes must
    // overwrite the initial snapshot so the UI reflects live engine
    // state rather than only the bootstrap fetch.
    act(() => {
      captured!.onData(makePayload('pushed'))
    })
    expect(result.current.data?.primary.instrument.displayName).toBe('pushed')
  })

  it('surfaces stream errors without clobbering the last good payload', async () => {
    getDashboardMock.mockResolvedValue(makePayload('good'))
    let captured: DashboardSubscriber | null = null
    subscribeDashboardMock.mockImplementation((subscriber: DashboardSubscriber) => {
      captured = subscriber
      return () => {}
    })

    const { result } = renderHook(() => useDashboard())
    await waitFor(() => {
      expect(result.current.data?.primary.instrument.displayName).toBe('good')
    })

    act(() => {
      captured!.onError?.(new Error('stream blip'))
    })
    // Keep last good data so a transient stream error degrades
    // gracefully (UI can badge "stale" over the previous snapshot
    // instead of going blank).
    expect(result.current.error?.message).toBe('stream blip')
    expect(result.current.data?.primary.instrument.displayName).toBe('good')
  })

  it('unsubscribes when the component unmounts', async () => {
    getDashboardMock.mockResolvedValue(makePayload('initial'))
    const unsubscribe = vi.fn()
    subscribeDashboardMock.mockReturnValue(unsubscribe)

    const { unmount } = renderHook(() => useDashboard())
    await waitFor(() => expect(subscribeDashboardMock).toHaveBeenCalled())

    unmount()
    // Without a teardown the EventSource (or simulated stream timer in
    // mock mode) would leak across page transitions.
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
