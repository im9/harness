import type {
  Bar,
  DashboardPayload,
  IndicatorLine,
  InstrumentRowState,
  PnlPoint,
  Timeframe,
  WatchlistItem,
} from './dashboard-types'
import { TIMEFRAMES, TIMEFRAME_SEC } from './dashboard-types'
import {
  DEFAULT_PRIMARY_SYMBOL,
  computeEma,
  computeVwap,
  dashboardCommon,
  dashboardUniverse,
  emaPair,
  generateBars,
  pctChangeOf,
  round,
  seededRandom,
  sparklineFromBars,
} from './mocks/dashboard'
import type { DashboardCommon } from './mocks/dashboard'

// In-memory mock backend. Holds a universe of tracked instruments +
// common data and projects a `DashboardPayload` on demand. ADR 004
// §Swap is a view-level action describes the protocol: the engine
// would track every instrument natively; here we simulate it by
// keeping per-timeframe bar series for every tracked symbol and
// advancing them all on each snapshot. The snapshot then projects the
// requested `primarySymbol` as the heavy primary and every *other*
// symbol as a light WatchlistItem.
//
// The constructor accepts a universe-shaped seed so tests can exercise
// a single-instrument, a swap-between-two, or any other configuration
// without reshaping the payload contract inline.

const BAR_COUNT = 120
const PNL_STEP_MIN = 15
const DEFAULT_TIMEFRAME: Timeframe = '10s'

interface Series {
  bars: Bar[]
  indicators: IndicatorLine[]
}

type SeriesMap = Map<Timeframe, Series>

export interface MockBackendSeed {
  // Full InstrumentRowState per tracked instrument. Every member is a
  // promotable primary — on swap, any of them can become the heavy
  // focus. Engine-produced fields (state / setup / macro) come from
  // the seed; indicators and bars are regenerated per-timeframe when
  // the backend needs to synthesize them for a timeframe the seed
  // does not cover.
  universe: InstrumentRowState[]
  // Symbol → pctChange. Carried through onto WatchlistItem projections
  // untouched — the mock does not drift this value over time.
  pctChanges: Record<string, number>
  defaultPrimary: string
  common: DashboardCommon
}

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
  return {
    bars,
    indicators: [
      ...emaPair(bars),
      { name: 'VWAP', kind: 'vwap', points: computeVwap(bars) },
    ],
  }
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
    if (ind.kind === 'vwap') {
      return { ...ind, points: computeVwap(bars) }
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
  // Which tracked instrument the dashboard is currently focused on
  // (ADR 004 swap mechanics). Undefined → defaults to the seed's
  // `defaultPrimary`, used for initial page load.
  primarySymbol?: string
}

interface UniverseEntry {
  row: InstrumentRowState
  seriesBySymbol: SeriesMap
}

const defaultSeed: MockBackendSeed = {
  universe: dashboardUniverse,
  pctChanges: pctChangeOf,
  defaultPrimary: DEFAULT_PRIMARY_SYMBOL,
  common: dashboardCommon,
}

export class MockBackend {
  private entries: Map<string, UniverseEntry>
  private pctChanges: Record<string, number>
  private defaultPrimary: string
  private common: DashboardCommon
  private pnlStartSec: number

  constructor(seed: MockBackendSeed = defaultSeed) {
    const cloned: MockBackendSeed = {
      universe: seed.universe.map((row) => structuredClone(row)),
      pctChanges: { ...seed.pctChanges },
      defaultPrimary: seed.defaultPrimary,
      common: structuredClone(seed.common),
    }

    this.pctChanges = cloned.pctChanges
    this.defaultPrimary = cloned.defaultPrimary
    this.common = cloned.common

    const primarySeedRow =
      cloned.universe.find(
        (row) => row.instrument.symbol === cloned.defaultPrimary,
      ) ?? cloned.universe[0]
    const nowSec =
      primarySeedRow?.bars.at(-1)?.time ?? Math.floor(Date.now() / 1000)

    this.entries = new Map()
    for (const row of cloned.universe) {
      const seriesMap = buildSeriesMap(row, nowSec)
      // If the seed brought its own bar history, respect it for the tf
      // whose cadence matches. Keeps unit tests predictable when they
      // hand a hand-written fixture instead of relying on synthesized
      // replacement bars.
      if (row.bars.length >= 2) {
        const step =
          row.bars[row.bars.length - 1].time -
          row.bars[row.bars.length - 2].time
        const matched = TIMEFRAMES.find((tf) => TIMEFRAME_SEC[tf] === step)
        if (matched) {
          seriesMap.set(matched, {
            bars: [...row.bars],
            indicators: row.indicators.map((i) => ({
              ...i,
              points: [...i.points],
            })),
          })
        }
      }
      this.entries.set(row.instrument.symbol, { row, seriesBySymbol: seriesMap })
    }

    this.pnlStartSec =
      nowSec - (this.common.intradayPnl.length - 1) * PNL_STEP_MIN * 60
  }

  getSnapshot(options: SnapshotOptions = {}): DashboardPayload {
    const wallNow = options.nowSec ?? Math.floor(Date.now() / 1000)
    const tfMap = options.timeframes ?? {}
    const requestedSymbol = options.primarySymbol ?? this.defaultPrimary
    const primarySymbol = this.entries.has(requestedSymbol)
      ? requestedSymbol
      : this.defaultPrimary

    // Advance every tf for every tracked instrument so a mid-session
    // swap shows up-to-date bars without a catch-up lag. Cost is
    // bounded: a handful of symbols × the TIMEFRAMES length.
    for (const [symbol, entry] of this.entries) {
      for (const tf of TIMEFRAMES) {
        const series = entry.seriesBySymbol.get(tf)
        if (!series) continue
        const rand = seededRandom(Math.floor(wallNow) ^ hashSeed(symbol, tf))
        const advanced = advanceSeries(series, tf, wallNow, entry.row, rand)
        entry.seriesBySymbol.set(tf, advanced)
      }
    }

    const intradayPnl = extendPnl(
      this.common.intradayPnl,
      wallNow,
      this.pnlStartSec,
    )
    this.common = { ...this.common, intradayPnl }

    const primaryEntry = this.entries.get(primarySymbol)!
    const primaryTf = tfMap[primarySymbol] ?? DEFAULT_TIMEFRAME
    const primarySeries = primaryEntry.seriesBySymbol.get(primaryTf)
    const primaryBars = primarySeries?.bars ?? []
    const primaryIndicators = primarySeries?.indicators ?? []
    const primaryLast = primaryBars[primaryBars.length - 1]
    const primary: InstrumentRowState = {
      ...primaryEntry.row,
      bars: primaryBars,
      indicators: primaryIndicators,
      lastPrice: primaryLast?.close ?? primaryEntry.row.lastPrice,
      lastPriceAt: primaryLast
        ? new Date(primaryLast.time * 1000).toISOString()
        : primaryEntry.row.lastPriceAt,
    }

    const watchlist: WatchlistItem[] = []
    for (const [symbol, entry] of this.entries) {
      if (symbol === primarySymbol) continue
      // Watchlist sparklines ride on the short-cadence series so the
      // mini-row shape is readable; a daily sparkline for a single-
      // session dashboard would collapse to one point.
      const sparkSeries = entry.seriesBySymbol.get(DEFAULT_TIMEFRAME)
      const sparkBars = sparkSeries?.bars ?? entry.row.bars
      const last = sparkBars[sparkBars.length - 1]
      watchlist.push({
        instrument: entry.row.instrument,
        state: entry.row.state,
        lastPrice: last?.close ?? entry.row.lastPrice,
        lastPriceAt: last
          ? new Date(last.time * 1000).toISOString()
          : entry.row.lastPriceAt,
        pctChange: this.pctChanges[symbol] ?? 0,
        sparkline: sparklineFromBars(sparkBars),
      })
    }

    return structuredClone({
      sessionPhase: this.common.sessionPhase,
      nextMacroEvent: this.common.nextMacroEvent,
      intradayPnl: this.common.intradayPnl,
      rule: this.common.rule,
      news: this.common.news,
      primary,
      watchlist,
    })
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
