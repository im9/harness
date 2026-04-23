import type { SparklinePoint } from '@/lib/dashboard-types'
import { cn } from '@/lib/utils'

export interface SparklineProps {
  points: SparklinePoint[]
  // Controls stroke / dot color. `positive` → emerald, otherwise rose.
  // Sign-driven color mirrors the pctChange tone in the mini-row so
  // the operator's glance reads direction before precision.
  positive?: boolean
  width?: number
  height?: number
  className?: string
}

// Vertical padding inside the SVG viewBox. Keeps the stroke and the
// last-point dot from clipping at the top/bottom edges when a value
// sits exactly at min or max — which happens on every sparkline for
// at least two bars.
const PAD = 2

// Self-rolled SVG sparkline (ADR 004 (g) — "not a second
// `lightweight-charts` instance per row"). Renders a polyline over
// the bar closes with a dot on the last point, auto-fitting min and
// max to the available height. Deliberately thin: no axes, no
// interaction, no tooltip. All of that is what made `AreaChart` the
// wrong primitive for a mini-row.
export default function Sparkline({
  points,
  positive = true,
  width = 72,
  height = 24,
  className,
}: SparklineProps) {
  if (points.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={className}
        aria-hidden
      />
    )
  }

  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  // Flat series (max === min): pin the line to the vertical center so
  // it renders as a visible horizontal stroke rather than a collapse
  // against the top edge or a division-by-zero.
  const range = max - min || 1
  const usableHeight = height - 2 * PAD
  const stepX = points.length > 1 ? width / (points.length - 1) : 0
  const toY = (value: number) =>
    PAD + usableHeight - ((value - min) / range) * usableHeight

  const pathD = points
    .map((p, i) => {
      const x = i * stepX
      const y = toY(p.value)
      const command = i === 0 ? 'M' : 'L'
      return `${command}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  const lastValue = values[values.length - 1]
  const lastX = (points.length - 1) * stepX
  const lastY = toY(lastValue)

  const stroke = positive ? 'stroke-emerald-500' : 'stroke-rose-500'
  const fill = positive ? 'fill-emerald-500' : 'fill-rose-500'

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden
      data-sign={positive ? 'positive' : 'negative'}
    >
      <path
        d={pathD}
        className={cn('fill-none', stroke)}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={1.5} className={fill} />
    </svg>
  )
}
