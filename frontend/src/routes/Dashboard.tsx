import PriceChart from '@/components/dashboard/PriceChart'
import RuleGauge from '@/components/dashboard/RuleGauge'
import StateBanner from '@/components/dashboard/StateBanner'
import StatusStrip from '@/components/dashboard/StatusStrip'
import { dashboardDefault } from '@/lib/mocks/dashboard'

export default function Dashboard() {
  const payload = dashboardDefault

  return (
    <div className="flex flex-col gap-6">
      <StatusStrip
        sessionPhase={payload.sessionPhase}
        intradayPnl={payload.intradayPnl}
        nextMacroEvent={payload.nextMacroEvent}
      />
      <div className="flex flex-col gap-8">
        {payload.rows.map((row) => (
          <section
            key={row.instrument.symbol}
            aria-label={`${row.instrument.displayName} row`}
            className="flex flex-col gap-3"
          >
            <StateBanner row={row} />
            <PriceChart row={row} />
            <RuleGauge rule={payload.rule} />
          </section>
        ))}
      </div>
    </div>
  )
}
