import { AreaChart } from '@/components/ui/area-chart'
import type { DashboardPayload, SessionPhase } from '@/lib/dashboard-types'

interface StatusStripProps {
  sessionPhase: DashboardPayload['sessionPhase']
  intradayPnl: DashboardPayload['intradayPnl']
  nextMacroEvent: DashboardPayload['nextMacroEvent']
}

const PHASE_LABEL: Record<SessionPhase, string> = {
  pre_open: 'Pre-open',
  open: 'Open',
  lunch: 'Lunch',
  close: 'Close',
  after_hours: 'After-hours',
}

function formatEventCountdown(atIso: string, now: Date = new Date()): string {
  const diffMs = new Date(atIso).getTime() - now.getTime()
  if (diffMs <= 0) return 'now'
  const mins = Math.round(diffMs / 60_000)
  if (mins < 60) return `in ${mins}m`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem ? `in ${hrs}h ${rem}m` : `in ${hrs}h`
}

export default function StatusStrip({
  sessionPhase,
  intradayPnl,
  nextMacroEvent,
}: StatusStripProps) {
  const current = intradayPnl.length ? intradayPnl[intradayPnl.length - 1].pnl : 0
  const positive = current >= 0
  const tone = positive
    ? 'text-emerald-600 dark:text-emerald-300'
    : 'text-rose-600 dark:text-rose-400'
  const sign = positive ? '+' : '-'
  const magnitude = Math.abs(current).toLocaleString('en-US')

  return (
    <section
      aria-label="Session status"
      className="border-border bg-card/40 flex flex-wrap items-center gap-6 rounded-md border px-4 py-3"
    >
      <div className="flex items-center gap-4">
        <div className="flex flex-col">
          <span className="text-muted-foreground text-[11px] uppercase tracking-wide">
            Intraday P&amp;L
          </span>
          <span className={`text-2xl font-semibold tabular-nums ${tone}`}>
            {sign}
            {magnitude}
          </span>
        </div>
        <div className="h-10 w-32">
          <AreaChart
            data={intradayPnl}
            index="t"
            categories={['pnl']}
            colors={[positive ? 'emerald' : 'rose']}
            showLegend={false}
            showXAxis={false}
            showYAxis={false}
            showGridLines={false}
            showTooltip={false}
            autoMinValue
          />
        </div>
      </div>

      <div className="flex flex-col">
        <span className="text-muted-foreground text-[11px] uppercase tracking-wide">
          Session
        </span>
        <span className="text-foreground text-sm font-medium">
          {PHASE_LABEL[sessionPhase]}
        </span>
      </div>

      <div className="flex flex-col">
        <span className="text-muted-foreground text-[11px] uppercase tracking-wide">
          Next event
        </span>
        {nextMacroEvent ? (
          <span className="text-foreground text-sm font-medium">
            {nextMacroEvent.eventName}
            <span className="text-muted-foreground ml-2 text-xs">
              {formatEventCountdown(nextMacroEvent.at)}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">No upcoming event</span>
        )}
      </div>
    </section>
  )
}
