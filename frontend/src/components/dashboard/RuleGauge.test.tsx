import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { RuleOverlayState } from '@/lib/dashboard-types'
import RuleGauge from './RuleGauge'

function rule(overrides: Partial<RuleOverlayState> = {}): RuleOverlayState {
  const base: RuleOverlayState = {
    used: 930,
    cap: 2000,
    capReached: false,
    cooldownActive: false,
    cooldownUntil: null,
    quoteCurrency: 'USD',
  }
  return { ...base, ...overrides }
}

describe('RuleGauge', () => {
  it('renders a progressbar that reports the used-vs-cap ratio', () => {
    render(<RuleGauge rule={rule({ used: 930, cap: 2000 })} />)
    const bar = screen.getByRole('progressbar')
    // ARIA progressbar semantics let screen readers describe the gauge as
    // a proportion (used / cap). The scale is 0–100 so the value matches
    // the percentage the rule overlay uses to drive ENTER suppression.
    expect(bar).toHaveAttribute('aria-valuenow', '46') // 930/2000 = 46.5% → rounded down
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
  })

  it('labels the gauge with a used-of-cap summary line', () => {
    render(<RuleGauge rule={rule({ used: 930, cap: 2000 })} />)
    // The text surfaces the absolute numbers because the percentage alone
    // hides scale — "46%" of $50 feels different from 46% of $5,000.
    expect(screen.getByText(/930/)).toBeInTheDocument()
    expect(screen.getByText(/2,000/)).toBeInTheDocument()
  })

  it('exposes a cap-reached alert so assistive tech announces the lockout', () => {
    render(<RuleGauge rule={rule({ used: 2100, cap: 2000, capReached: true })} />)
    // When the cap is hit the engine stops emitting ENTER (ADR 004 Rule
    // overlay). role=alert ensures screen readers interrupt with this
    // state change rather than silently updating the progressbar.
    expect(screen.getByRole('alert')).toHaveTextContent(/cap reached/i)
  })

  it('shows cooldown timing when cooldown is active', () => {
    render(
      <RuleGauge
        rule={rule({ cooldownActive: true, cooldownUntil: '2026-04-23T15:00:00Z' })}
      />,
    )
    expect(screen.getByText(/cooldown/i)).toBeInTheDocument()
  })

  it('clamps the gauge to 100 when used exceeds cap', () => {
    // ADR 004 allows the cap to be breached in principle (the engine
    // disables ENTER but unrealized P&L can keep moving). The progressbar
    // numeric scale caps at 100 so it never reports a nonsensical >100%
    // value; capReached carries the "we are past the line" signal.
    render(<RuleGauge rule={rule({ used: 3000, cap: 2000, capReached: true })} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })
})
