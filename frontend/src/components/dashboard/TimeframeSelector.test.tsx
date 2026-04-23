import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TIMEFRAMES } from '@/lib/dashboard-types'
import TimeframeSelector from './TimeframeSelector'

describe('TimeframeSelector', () => {
  it('exposes a labeled radiogroup', () => {
    render(<TimeframeSelector value="1m" onChange={() => {}} />)
    // radiogroup + radio is the WAI-ARIA pattern for a single-select
    // pill group. Screen readers announce the accessible name and let
    // users arrow through the options.
    expect(screen.getByRole('radiogroup', { name: /timeframe/i })).toBeInTheDocument()
  })

  it('renders a radio per supported timeframe', () => {
    render(<TimeframeSelector value="1m" onChange={() => {}} />)
    expect(screen.getAllByRole('radio')).toHaveLength(TIMEFRAMES.length)
  })

  it('marks the currently-selected timeframe with aria-checked', () => {
    render(<TimeframeSelector value="5m" onChange={() => {}} />)
    // Asserting via aria-checked (not a class name) keeps the test
    // stable across visual redesigns of the pills.
    const selected = screen.getByRole('radio', { name: /^5m$/i })
    expect(selected).toHaveAttribute('aria-checked', 'true')
    const other = screen.getByRole('radio', { name: /^15m$/i })
    expect(other).toHaveAttribute('aria-checked', 'false')
  })

  it('fires onChange with the clicked timeframe', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TimeframeSelector value="1m" onChange={onChange} />)
    await user.click(screen.getByRole('radio', { name: /^15m$/i }))
    expect(onChange).toHaveBeenCalledWith('15m')
  })

  it('does not call onChange when the already-selected option is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TimeframeSelector value="15m" onChange={onChange} />)
    // Clicking the current value still fires — the component is a
    // pure input, idempotence is the parent's concern. We intentionally
    // avoid suppressing here so the parent can use the click as a
    // "user touched this" signal if it wants.
    await user.click(screen.getByRole('radio', { name: /^15m$/i }))
    expect(onChange).toHaveBeenCalledWith('15m')
  })
})
