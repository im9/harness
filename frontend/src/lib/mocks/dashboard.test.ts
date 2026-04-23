import { describe, expect, it } from 'vitest'
import { dashboardDefault, dashboardScenarios } from './dashboard'

const VALID_STATES = ['ENTER', 'HOLD', 'EXIT', 'RETREAT']
const VALID_PHASES = ['pre_open', 'open', 'lunch', 'close', 'after_hours']

describe('dashboard mocks', () => {
  it('default scenario carries at least one instrument row', () => {
    // The dashboard layout is defined as one row per tracked instrument
    // (ADR 004 Layout section). A zero-row payload would render an empty
    // page and mask regressions in the per-row components. Keep at least
    // one row so smoke tests against the default scenario remain meaningful.
    expect(dashboardDefault.rows.length).toBeGreaterThanOrEqual(1)
  })

  it('every row state is one of the four ADR-004 recommendation values', () => {
    for (const row of dashboardDefault.rows) {
      expect(VALID_STATES).toContain(row.state)
    }
  })

  it('session phase is one of the declared SessionPhase values', () => {
    expect(VALID_PHASES).toContain(dashboardDefault.sessionPhase)
  })

  it('rule state reports used ≤ cap when cap has not been reached', () => {
    // capReached is the engine's authoritative signal; the used / cap
    // pair is a human-readable projection. When capReached is false, the
    // invariant used ≤ cap must hold so the gauge never renders > 100 %
    // full while reporting a non-capped state.
    if (!dashboardDefault.rule.capReached) {
      expect(dashboardDefault.rule.used).toBeLessThanOrEqual(dashboardDefault.rule.cap)
    }
  })

  it('exposes every scenario through the scenarios index', () => {
    // The scenarios map is how the mock-mode selector in the Settings UI
    // will enumerate choices. Each scenario should appear there, not
    // just as a loose export.
    expect(dashboardScenarios.default).toBe(dashboardDefault)
  })
})
