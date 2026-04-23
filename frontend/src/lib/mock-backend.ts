import type {
  Bar,
  DashboardPayload,
  IndicatorLine,
  InstrumentRowState,
  PnlPoint,
  Timeframe,
} from './dashboard-types'
import { TIMEFRAMES, TIMEFRAME_SEC } from './dashboard-types'
import {
  computeEma,
  dashboardDefault,
  emaPair,
  generateBars,
  round,
  seededRandom,
} from './mocks/dashboard'

// In-memory mock backend. Holds a mutable DashboardPayload and advances
// it on each getSnapshot() call. ADR 004 Section "Development providers"
// describes the protocol; this is the frontend-side stand-in until the
// real `MarketDataProvider` + `SetupEngine` pipeline is wired up.
//
// Multi-timeframe: per instrument we keep an independent bar series per
// timeframe (10s / 1m / 5m / ... / 1w). getSnapshot accepts a
// `timeframes: { [symbol]: Timeframe }` map and returns the matching
// series for each row. All series advance against wall clock on every
// snapshot so switching timeframes mid-session shows a current chart,
// not one frozen at the moment the UI first subscribed.

const BAR_COUNT = 120
const PNL_STEP_MIN = 15
const DEFAULT_TIMEFRAME: Timeframe = '10s'

interface Series {
  bars: Bar[]
  indicators: IndicatorLine[]
}

type SeriesMap = Map<Timeframe, Series>

// Timeframe volatility scaling. Longer timeframes compound variance
// (~sqrt(time) under standard random-walk assumptions) so 1d bars need
// a bigger per-bar move than 10s bars to look realistic. Anchor at
// 10s = 1.0 and scale by sqrt(step / 10). Rough — real markets differ
// — but keeps the mock charts visually distinct per timeframe.
function volatilityScale(tf: Timeframe): number {
  return Math.sqrt(TIMEFRAME_SEC[tf] / TIMEFRAME_SEC['10s'])
}

function hashSeed(symbol: string, tf: Timeframe): number {
  // Deterministic seed from (symbol × tf) so each series is stable
  // across reloads and different tfs of the same symbol don't collide.
  let h = 2166136261 >>> 0
  const input = `${symbol}:${tf}`
  for (let i = 0; i < input.length; i++) {
    h = (h ^ input.charCodeAt(i)) >>> 0
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

function buildSeriesForTimeframe(
  row: InstrumentRowState,
  tf: Timeframe,
  endTimeSec: number,
): Series {
  const stepSec = TIMEFRAME_SEC[tf]
  const tickSize = row.instrument.tickSize
  const volatility = Math.max(tickSize * 4, 0.5) * volatilityScale(tf)
  const bars = generateBars(
    hashSeed(row.instrument.symbol, tf),
    BAR_COUNT,
    row.lastPrice,
    row.lastPrice,
    volatility,
    tickSize,
    endTimeSec,
    stepSec,
  )
  return { bars, indicators: emaPair(bars) }
}

function buildSeriesMap(row: InstrumentRowState, nowSec: number): SeriesMap {
  const map: SeriesMap = new Map()
  for (const tf of TIMEFRAMES) {
    map.set(tf, buildSeriesForTimeframe(row, tf, nowSec))
  }
  return map
}

function advanceSeries(
  series: Series,
  tf: Timeframe,
  nowSec: number,
  row: InstrumentRowState,
  rand: () => number,
): Series {
  // Append zero or more bars up to `nowSec`, then re-derive the
  // indicators over the extended series. Short timeframes get frequent
  // appends; `1w` may go the entire session without a new bar.
  const stepSec = TIMEFRAME_SEC[tf]
  const tickSize = row.instrument.tickSize
  const volatility = Math.max(tickSize * 4, 0.5) * volatilityScale(tf)
  const bars = [...series.bars]
  let last = bars[bars.length - 1]
  while (last && last.time + stepSec <= nowSec) {
    const nextTime = last.time + stepSec
    const open = last.close
    const close = open + (rand() - 0.5) * volatility * 2
    const high = Math.max(open, close) + rand() * volatility
    const low = Math.min(open, close) - rand() * volatility
    const range = Math.max(high - low, tickSize)
    const bar: Bar = {
      time: nextTime,
      open: round(open, tickSize),
      high: round(high, tickSize),
      low: round(low, tickSize),
      close: round(close, tickSize),
      // Same range-anchored formula as generateBars so the appended
      // bars' volume distribution doesn't visibly shift at the seam
      // between seeded history and live append.
      volume: Math.round(400 + range * 80 + rand() * 300),
    }
    bars.push(bar)
    last = bar
  }
  if (bars.length === series.bars.length) {
    return series
  }
  const indicators = series.indicators.map((ind) => {
    if (ind.kind === 'ema') {
      const period = Number(ind.name.match(/(\d+)/)?.[1] ?? 20)
      return { ...ind, points: computeEma(bars, period) }
    }
    return ind
  })
  return { bars, indicators }
}

function extendPnl(pnl: PnlPoint[], nowSec: number, startSec: number): PnlPoint[] {
  if (pnl.length === 0) return pnl
  const result = [...pnl]
  const rand = seededRandom(Math.floor(nowSec))
  let lastBucketSec = startSec + (result.length - 1) * PNL_STEP_MIN * 60
  let lastValue = result[result.length - 1].pnl
  while (lastBucketSec + PNL_STEP_MIN * 60 <= nowSec) {
    lastBucketSec += PNL_STEP_MIN * 60
    lastValue = Math.round(lastValue + (rand() - 0.5) * 200)
    const d = new Date(lastBucketSec * 1000)
    const hh = String(d.getUTCHours()).padStart(2, '0')
    const mm = String(d.getUTCMinutes()).padStart(2, '0')
    result.push({ t: `${hh}:${mm}`, pnl: lastValue })
  }
  return result
}

export interface SnapshotOptions {
  nowSec?: number
  timeframes?: Record<string, Timeframe>
}

export class MockBackend {
  private base: DashboardPayload
  private seriesBySymbol: Map<string, SeriesMap>
  private pnlStartSec: number

  constructor(seed?: DashboardPayload) {
    this.base = structuredClone(seed ?? dashboardDefault)
    this.seriesBySymbol = new Map()

    const nowSec =
      this.base.rows[0]?.bars.at(-1)?.time ?? Math.floor(Date.now() / 1000)
    for (const row of this.base.rows) {
      const map = buildSeriesMap(row, nowSec)
      // If the seed brought its own bar history, respect it for the tf
      // whose cadence matches — handy for tests that hand in a specific
      // fixture and want the assertions to land against exactly those
      // bars rather than a synthesized replacement.
      if (row.bars.length >= 2) {
        const step = row.bars[row.bars.length - 1].time - row.bars[row.bars.length - 2].time
        const matched = TIMEFRAMES.find((tf) => TIMEFRAME_SEC[tf] === step)
        if (matched) {
          map.set(matched, { bars: [...row.bars], indicators: row.indicators.map((i) => ({ ...i, points: [...i.points] })) })
        }
      }
      this.seriesBySymbol.set(row.instrument.symbol, map)
    }

    this.pnlStartSec = nowSec - (this.base.intradayPnl.length - 1) * PNL_STEP_MIN * 60
  }

  getSnapshot(options: SnapshotOptions = {}): DashboardPayload {
    const wallNow = options.nowSec ?? Math.floor(Date.now() / 1000)
    const tfMap = options.timeframes ?? {}

    // Advance every tf for every symbol so switching mid-session shows
    // up-to-date bars without a catch-up lag.
    for (const [symbol, seriesMap] of this.seriesBySymbol) {
      const row = this.base.rows.find((r) => r.instrument.symbol === symbol)
      if (!row) continue
      for (const tf of TIMEFRAMES) {
        const series = seriesMap.get(tf)
        if (!series) continue
        const rand = seededRandom(Math.floor(wallNow) ^ hashSeed(symbol, tf))
        const advanced = advanceSeries(series, tf, wallNow, row, rand)
        seriesMap.set(tf, advanced)
      }
    }

    const intradayPnl = extendPnl(this.base.intradayPnl, wallNow, this.pnlStartSec)
    this.base = { ...this.base, intradayPnl }

    const rows = this.base.rows.map((row) => {
      const tf = tfMap[row.instrument.symbol] ?? DEFAULT_TIMEFRAME
      const series = this.seriesBySymbol.get(row.instrument.symbol)?.get(tf)
      const bars = series?.bars ?? []
      const indicators = series?.indicators ?? []
      const last = bars[bars.length - 1]
      return {
        ...row,
        bars,
        indicators,
        lastPrice: last?.close ?? row.lastPrice,
        lastPriceAt: last ? new Date(last.time * 1000).toISOString() : row.lastPriceAt,
      }
    })

    return structuredClone({ ...this.base, rows })
  }
}

let singleton: MockBackend | null = null

export function getMockBackend(): MockBackend {
  if (!singleton) singleton = new MockBackend()
  return singleton
}

export function resetMockBackend(): void {
  singleton = null
}
