// Ported from Tremor Raw CategoryBar v0.0.3 with two local simplifications:
//   - `cx` → shadcn `cn` to match the project-wide class-merge helper.
//   - The Tooltip-wrapped marker variant is dropped for this spike so we
//     don't have to pull the Tooltip primitive in for a tooltip-free use.
//     Passing a `marker.tooltip` value is a no-op; the plain marker pill
//     still renders.

import React from 'react'
import {
  AvailableChartColors,
  type AvailableChartColorsKeys,
  getColorClassName,
} from '@/lib/chart-utils'
import { cn } from '@/lib/utils'

const getMarkerBgColor = (
  marker: number | undefined,
  values: number[],
  colors: AvailableChartColorsKeys[],
): string => {
  if (marker === undefined) return ''
  if (marker === 0) {
    for (let index = 0; index < values.length; index++) {
      if (values[index] > 0) {
        return getColorClassName(colors[index], 'bg')
      }
    }
  }

  let prefixSum = 0
  for (let index = 0; index < values.length; index++) {
    prefixSum += values[index]
    if (prefixSum >= marker) {
      return getColorClassName(colors[index], 'bg')
    }
  }

  return getColorClassName(colors[values.length - 1], 'bg')
}

const getPositionLeft = (value: number | undefined, maxValue: number): number =>
  value ? (value / maxValue) * 100 : 0

const sumNumericArray = (arr: number[]) =>
  arr.reduce((prefixSum, num) => prefixSum + num, 0)

const formatNumber = (num: number): string => {
  if (Number.isInteger(num)) return num.toString()
  return num.toFixed(1)
}

function BarLabels({ values }: { values: number[] }) {
  // Compute per-segment metadata in one pass so render stays pure — the
  // upstream Tremor implementation mutates two `let` counters inside
  // .map() which react-hooks/immutability rightly flags.
  const sumValues = React.useMemo(() => sumNumericArray(values), [values])
  const segments = React.useMemo(() => {
    type Segment = { prefix: number; show: boolean; widthPercent: number }
    type Acc = { out: Segment[]; prefix: number; hiddenStreak: number }
    const initial: Acc = { out: [], prefix: 0, hiddenStreak: 0 }
    return values.reduce<Acc>((acc, width) => {
      const prefix = acc.prefix + width
      const show =
        (width >= 0.1 * sumValues ||
          acc.hiddenStreak >= 0.09 * sumValues) &&
        sumValues - prefix >= 0.1 * sumValues &&
        prefix >= 0.1 * sumValues &&
        prefix < 0.9 * sumValues
      const hiddenStreak = show ? 0 : acc.hiddenStreak + width
      return {
        out: [
          ...acc.out,
          {
            prefix,
            show,
            widthPercent: getPositionLeft(width, sumValues),
          },
        ],
        prefix,
        hiddenStreak,
      }
    }, initial).out
  }, [values, sumValues])

  return (
    <div
      className={cn(
        'relative mb-2 flex h-5 w-full text-sm font-medium',
        'text-gray-700 dark:text-gray-300',
      )}
    >
      <div className="absolute bottom-0 left-0 flex items-center">0</div>
      {segments.map((segment, index) => (
        <div
          key={`item-${index}`}
          className="flex items-center justify-end pr-0.5"
          style={{ width: `${segment.widthPercent}%` }}
        >
          {segment.show ? (
            <span className={cn('block translate-x-1/2 text-sm tabular-nums')}>
              {formatNumber(segment.prefix)}
            </span>
          ) : null}
        </div>
      ))}
      <div className="absolute right-0 bottom-0 flex items-center">
        {formatNumber(sumValues)}
      </div>
    </div>
  )
}

interface CategoryBarProps extends React.HTMLAttributes<HTMLDivElement> {
  values: number[]
  colors?: AvailableChartColorsKeys[]
  marker?: { value: number; showAnimation?: boolean }
  showLabels?: boolean
}

const CategoryBar = React.forwardRef<HTMLDivElement, CategoryBarProps>(
  (
    {
      values = [],
      colors = AvailableChartColors,
      marker,
      showLabels = true,
      className,
      ...props
    },
    forwardedRef,
  ) => {
    const markerBgColor = React.useMemo(
      () => getMarkerBgColor(marker?.value, values, colors),
      [marker, values, colors],
    )

    const maxValue = React.useMemo(() => sumNumericArray(values), [values])

    const adjustedMarkerValue = React.useMemo(() => {
      if (marker === undefined) return undefined
      if (marker.value < 0) return 0
      if (marker.value > maxValue) return maxValue
      return marker.value
    }, [marker, maxValue])

    const markerPositionLeft: number = React.useMemo(
      () => getPositionLeft(adjustedMarkerValue, maxValue),
      [adjustedMarkerValue, maxValue],
    )

    return (
      <div
        ref={forwardedRef}
        data-slot="category-bar"
        className={cn(className)}
        aria-label="Category bar"
        aria-valuenow={marker?.value}
        {...props}
      >
        {showLabels ? <BarLabels values={values} /> : null}
        <div className="relative flex h-2 w-full items-center">
          <div className="flex h-full flex-1 items-center gap-0.5 overflow-hidden rounded-full">
            {values.map((value, index) => {
              const barColor = colors[index] ?? 'gray'
              const percentage = (value / maxValue) * 100
              return (
                <div
                  key={`item-${index}`}
                  className={cn(
                    'h-full',
                    getColorClassName(barColor, 'bg'),
                    percentage === 0 && 'hidden',
                  )}
                  style={{ width: `${percentage}%` }}
                />
              )
            })}
          </div>

          {marker !== undefined ? (
            <div
              className={cn(
                'absolute w-2 -translate-x-1/2',
                marker.showAnimation &&
                  'transform-gpu transition-all duration-300 ease-in-out',
              )}
              style={{ left: `${markerPositionLeft}%` }}
            >
              <div
                aria-hidden="true"
                className={cn(
                  'mx-auto h-4 w-1 rounded-full ring-2',
                  'ring-white dark:ring-gray-950',
                  markerBgColor,
                )}
              />
            </div>
          ) : null}
        </div>
      </div>
    )
  },
)

CategoryBar.displayName = 'CategoryBar'

export { CategoryBar, type CategoryBarProps }
