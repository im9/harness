import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SparklinePoint } from '@/lib/dashboard-types'
import Sparkline from './Sparkline'

function makePoints(values: number[]): SparklinePoint[] {
  return values.map((value, i) => ({ time: 1_000_000 + i, value }))
}

describe('Sparkline', () => {
  it('renders an empty SVG when no points are provided', () => {
    // The Watchlist may receive an empty sparkline during the very
    // first tick before the seed has accumulated bars. Rendering an
    // empty SVG (rather than null) keeps the row layout stable — no
    // column collapse that would jiggle when data arrives.
    const { container } = render(<Sparkline points={[]} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.querySelector('path')).toBeNull()
    expect(svg?.querySelector('circle')).toBeNull()
  })

  it('draws a polyline with as many vertices as points', () => {
    // Segments = points - 1 (a 3-point line has 2 segments). Asserting
    // on the path `d` string's M-then-L count keeps the test
    // agnostic of pixel coordinates.
    const { container } = render(
      <Sparkline points={makePoints([10, 11, 9, 12])} />,
    )
    const d = container.querySelector('path')?.getAttribute('d') ?? ''
    // One "M" opener + three "L" segments = 4 commands total for 4 points
    const commands = d.match(/[ML]/g) ?? []
    expect(commands).toHaveLength(4)
    expect(commands[0]).toBe('M')
  })

  it('places a last-point dot at the final series coordinate', () => {
    // The dot anchors the operator's eye to "where are we now"; it
    // must sit on the rightmost vertex, not interpolated somewhere
    // along the path.
    const { container } = render(
      <Sparkline points={makePoints([10, 11, 9, 12])} width={60} height={20} />,
    )
    const circle = container.querySelector('circle')
    expect(circle).not.toBeNull()
    // Last x = (n-1) * (width / (n-1)) = width. Independent of values.
    expect(Number(circle?.getAttribute('cx'))).toBeCloseTo(60, 5)
  })

  it('colors the stroke emerald when positive and rose when negative', () => {
    // Color carries the sign redundantly with the row's pctChange
    // label so glance reads direction first. Matching on tailwind
    // class names is stable because the Sparkline owns its own
    // color language.
    const pos = render(<Sparkline points={makePoints([10, 11])} positive />)
    expect(pos.container.querySelector('path')?.className.baseVal).toMatch(
      /emerald/,
    )
    const neg = render(
      <Sparkline points={makePoints([10, 9])} positive={false} />,
    )
    expect(neg.container.querySelector('path')?.className.baseVal).toMatch(
      /rose/,
    )
  })

  it('does not collapse to zero height when all values are equal', () => {
    // A flat series (max === min) would produce a division-by-zero in
    // the y-normalization; the component pins the line to the
    // vertical center instead so it still renders a visible stroke.
    const { container } = render(<Sparkline points={makePoints([10, 10, 10])} />)
    const d = container.querySelector('path')?.getAttribute('d') ?? ''
    // All y-coordinates should be finite numbers
    const yValues = [...d.matchAll(/[ML][^,]+,([^\s]+)/g)].map((m) =>
      Number(m[1]),
    )
    expect(yValues.every((y) => Number.isFinite(y))).toBe(true)
  })
})
