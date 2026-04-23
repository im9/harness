import { CategoryBar } from '@/components/ui/category-bar'
import type { RuleOverlayState } from '@/lib/dashboard-types'

interface RuleGaugeProps {
  rule: RuleOverlayState
}

// Segment breakpoints for the proximity gauge. Derivation:
//   0–50 %  emerald — safe, at least half the daily budget remains
//   50–80 % amber   — warning zone, operator should be aware they've used
//                     the majority of the budget
//   80–100 % rose   — danger zone, approaching the ENTER-suppression line
// These are UX heuristics for a 3-tone proximity gauge; they match the
// breakpoints used on the ADR-003 Dashboard spike for consistency.
const SEGMENTS = [50, 30, 20] as const
const SEGMENT_COLORS = ['emerald', 'amber', 'rose'] as const

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString('en-US')}`
  }
}

export default function RuleGauge({ rule }: RuleGaugeProps) {
  const pctRaw = rule.cap > 0 ? (rule.used / rule.cap) * 100 : 0
  const pct = Math.min(100, Math.max(0, Math.floor(pctRaw)))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground uppercase tracking-wide">
          Loss cap
        </span>
        <span className="text-foreground tabular-nums">
          {formatCurrency(rule.used, rule.quoteCurrency)} of{' '}
          {formatCurrency(rule.cap, rule.quoteCurrency)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Daily loss cap usage"
      >
        <CategoryBar
          values={[...SEGMENTS]}
          colors={[...SEGMENT_COLORS]}
          marker={{ value: pct }}
          showLabels={false}
        />
      </div>
      {rule.capReached && (
        <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
          Cap reached — ENTER signals suppressed
        </p>
      )}
      {rule.cooldownActive && (
        <p className="text-xs text-muted-foreground">
          Cooldown active
          {rule.cooldownUntil ? ` until ${new Date(rule.cooldownUntil).toLocaleTimeString()}` : ''}
        </p>
      )}
    </div>
  )
}
