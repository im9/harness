import { forwardRef } from 'react'
import PriceChart, { type PriceChartHandle } from './PriceChart'
import RuleGauge from './RuleGauge'
import StateBanner from './StateBanner'
import type {
  InstrumentRowState,
  RuleOverlayState,
  Timeframe,
} from '@/lib/dashboard-types'

export interface PrimaryInstrumentPanelProps {
  row: InstrumentRowState
  rule: RuleOverlayState
  timeframe: Timeframe
  onTimeframeChange: (next: Timeframe) => void
}

// Left-column decision unit (ADR 004 Dashboard layout). Bundles the
// state banner, the price chart (with its volume sub-pane and all setup
// annotations), and the rule gauge into a single vertical stack so the
// operator reads the full decision context without eye-darting across
// the page. Forwards a `PriceChartHandle` ref so the Dashboard can wire
// the (i.3) chart-marker pulse without reaching through this layer's
// internals.
const PrimaryInstrumentPanel = forwardRef<
  PriceChartHandle,
  PrimaryInstrumentPanelProps
>(function PrimaryInstrumentPanel(
  { row, rule, timeframe, onTimeframeChange },
  ref,
) {
  return (
    // h-full + min-h-0 hands the remaining viewport height from the
    // Dashboard grid down to this panel; the chart wrapper below uses
    // flex-1 to claim whatever is left after the (thin) banner and
    // rule gauge. This is the ADR 004 "hero chart" contract: banner
    // and rule gauge are status strips, the chart is the surface.
    <section
      aria-label={`Primary instrument: ${row.instrument.displayName}`}
      className="flex h-full min-h-0 flex-col gap-3"
    >
      <StateBanner row={row} />
      <div className="flex min-h-0 flex-1 flex-col">
        <PriceChart
          ref={ref}
          row={row}
          timeframe={timeframe}
          onTimeframeChange={onTimeframeChange}
        />
      </div>
      <RuleGauge rule={rule} />
    </section>
  )
})

export default PrimaryInstrumentPanel
