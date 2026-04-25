import { TIMEFRAMES, type Timeframe } from '@/lib/dashboard-types'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface TimeframeSelectorProps {
  value: Timeframe
  onChange: (next: Timeframe) => void
}

// Display labels. Lowercase for sub-minute, uppercase unit letter for
// minute-and-above matches the convention used on most trading
// platforms (1m · 5m · 15m · 1H · 1D · 1W).
const LABEL: Record<Timeframe, string> = {
  '10s': '10s',
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1H',
  '1d': '1D',
  '1w': '1W',
}

export default function TimeframeSelector({ value, onChange }: TimeframeSelectorProps) {
  const { t } = useTranslation()
  return (
    <div
      role="radiogroup"
      aria-label={t('timeframe.aria')}
      className="border-border bg-muted/30 inline-flex items-center gap-0.5 rounded-md border p-0.5 text-xs"
    >
      {TIMEFRAMES.map((tf) => {
        const selected = tf === value
        return (
          <button
            key={tf}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(tf)}
            className={cn(
              'cursor-pointer rounded px-2 py-1 tabular-nums transition-colors',
              selected
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {LABEL[tf]}
          </button>
        )
      })}
    </div>
  )
}
