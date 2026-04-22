import { AreaChart } from '@/components/ui/area-chart'
import { BarChart } from '@/components/ui/bar-chart'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { CategoryBar } from '@/components/ui/category-bar'
import { Tracker, type TrackerBlockProps } from '@/components/ui/tracker'
import { useAuth } from '../auth-context'

// Dummy intraday P&L series (5-min buckets from 09:00 to 15:00 JST, mixed up
// and down so the AreaChart has shape).
const INTRADAY = [
  { t: '09:00', pnl: 0 },
  { t: '09:30', pnl: 800 },
  { t: '10:00', pnl: 1400 },
  { t: '10:30', pnl: 1100 },
  { t: '11:00', pnl: 200 },
  { t: '11:30', pnl: -600 },
  { t: '12:30', pnl: -900 },
  { t: '13:00', pnl: -1800 },
  { t: '13:30', pnl: -2400 },
  { t: '14:00', pnl: -3100 },
  { t: '14:30', pnl: -3800 },
  { t: '15:00', pnl: -4200 },
]

const SETUPS = [
  { setup: 'ORB', win: 14, loss: 6 },
  { setup: 'VWAP reclaim', win: 9, loss: 4 },
  { setup: 'PDH break', win: 7, loss: 5 },
  { setup: 'Reversal', win: 4, loss: 8 },
  { setup: 'Fade', win: 3, loss: 7 },
]

const SESSIONS: TrackerBlockProps[] = Array.from({ length: 20 }, (_, i) => {
  const mod5 = i % 5 === 0
  const mod7 = i % 7 === 0
  return {
    color: mod5
      ? 'bg-rose-500 dark:bg-rose-500'
      : mod7
        ? 'bg-amber-500 dark:bg-amber-500'
        : 'bg-emerald-500 dark:bg-emerald-500',
    tooltip: `Session ${i + 1}`,
  }
})

const yen = (n: number) => `¥${n.toLocaleString('en-US')}`

export default function Dashboard() {
  const { user } = useAuth()

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        Signed in as{' '}
        <strong className="text-foreground">{user?.username}</strong>
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Today&rsquo;s intraday P&amp;L</CardDescription>
            <CardTitle className="text-3xl tabular-nums">¥-4,200</CardTitle>
          </CardHeader>
          <CardContent>
            <AreaChart
              data={INTRADAY}
              index="t"
              categories={['pnl']}
              colors={['rose']}
              valueFormatter={yen}
              showLegend={false}
              autoMinValue
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Setup hit rate (last 30 sessions)</CardDescription>
            <CardTitle className="text-3xl tabular-nums">65%</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={SETUPS}
              index="setup"
              categories={['win', 'loss']}
              colors={['emerald', 'rose']}
              type="stacked"
              valueFormatter={(v) => `${v}`}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Loss cap used</CardDescription>
            <CardTitle className="text-3xl tabular-nums">62%</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBar
              values={[50, 30, 20]}
              colors={['emerald', 'amber', 'rose']}
              marker={{ value: 62 }}
              showLabels={false}
            />
            <p className="text-muted-foreground mt-2 text-sm">
              ¥-1,240 of ¥-2,000 daily cap
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Last 20 sessions</CardDescription>
            <CardTitle className="text-3xl tabular-nums">16W · 3L</CardTitle>
          </CardHeader>
          <CardContent>
            <Tracker data={SESSIONS} hoverEffect />
            <p className="text-muted-foreground mt-2 text-sm">
              1 scratch · most recent on the right
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
