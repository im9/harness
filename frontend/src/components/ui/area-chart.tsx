/* eslint-disable @typescript-eslint/no-explicit-any */
// Ported from Tremor Raw AreaChart v1.0.0. Local simplifications:
//   - `cx` → `cn` to match project-wide class-merge helper.
//   - Legend slider (ScrollButton, key-nav, @remixicon icons) dropped; the
//     spike keeps a flat wrapping legend so we don't pull another icon
//     library for a behaviour we don't need yet.
//   - onValueChange / activeDot / activeLegend interactivity removed to
//     cut ~200 lines. Can be reintroduced from upstream when click-to-
//     isolate semantics are actually required.

import React from 'react'
import {
  Area,
  CartesianGrid,
  AreaChart as RechartsAreaChart,
  Legend as RechartsLegend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AxisDomain } from 'recharts/types/util/types'

import {
  AvailableChartColors,
  type AvailableChartColorsKeys,
  constructCategoryColors,
  getColorClassName,
  getYAxisDomain,
} from '@/lib/chart-utils'
import { cn } from '@/lib/utils'

type LegendItemEntry = {
  name: string
  color: AvailableChartColorsKeys
}

function FlatLegend({ items }: { items: LegendItemEntry[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-3">
      {items.map((item) => (
        <li
          key={item.name}
          className="inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <span
            aria-hidden
            className={cn(
              'h-[3px] w-3.5 shrink-0 rounded-full',
              getColorClassName(item.color, 'bg'),
            )}
          />
          <span className="text-muted-foreground text-xs">{item.name}</span>
        </li>
      ))}
    </ol>
  )
}

type PayloadItem = {
  category: string
  value: number
  index: string
  color: AvailableChartColorsKeys
}

function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active: boolean | undefined
  payload: PayloadItem[]
  label: string
  valueFormatter: (value: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div
      className={cn(
        'rounded-md border text-sm shadow-md',
        'border-border bg-popover text-popover-foreground',
      )}
    >
      <div className="border-b border-inherit px-3 py-2 font-medium">
        {label}
      </div>
      <div className="space-y-1 px-3 py-2">
        {payload.map(({ value, category, color }, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-6"
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  'h-[3px] w-3.5 shrink-0 rounded-full',
                  getColorClassName(color, 'bg'),
                )}
              />
              <span className="text-muted-foreground">{category}</span>
            </span>
            <span className="text-right font-medium tabular-nums">
              {valueFormatter(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface AreaChartProps extends React.HTMLAttributes<HTMLDivElement> {
  data: Record<string, any>[]
  index: string
  categories: string[]
  colors?: AvailableChartColorsKeys[]
  valueFormatter?: (value: number) => string
  showXAxis?: boolean
  showYAxis?: boolean
  showGridLines?: boolean
  yAxisWidth?: number
  showTooltip?: boolean
  showLegend?: boolean
  autoMinValue?: boolean
  minValue?: number
  maxValue?: number
  connectNulls?: boolean
  type?: 'default' | 'stacked' | 'percent'
  fill?: 'gradient' | 'solid' | 'none'
}

export const AreaChart = React.forwardRef<HTMLDivElement, AreaChartProps>(
  (props, ref) => {
    const {
      data = [],
      categories = [],
      index,
      colors = AvailableChartColors,
      valueFormatter = (v: number) => v.toString(),
      showXAxis = true,
      showYAxis = true,
      showGridLines = true,
      yAxisWidth = 56,
      showTooltip = true,
      showLegend = true,
      autoMinValue = false,
      minValue,
      maxValue,
      connectNulls = false,
      className,
      type = 'default',
      fill = 'gradient',
      ...rest
    } = props

    const categoryColors = constructCategoryColors(categories, colors)
    const yAxisDomain = getYAxisDomain(autoMinValue, minValue, maxValue)
    const stacked = type === 'stacked' || type === 'percent'
    const areaId = React.useId()
    const paddingValue = !showXAxis && !showYAxis ? 0 : 20

    return (
      <div ref={ref} className={cn('h-72 w-full', className)} {...rest}>
        <ResponsiveContainer>
          <RechartsAreaChart
            data={data}
            margin={{ top: 5 }}
            stackOffset={type === 'percent' ? 'expand' : undefined}
          >
            {showGridLines ? (
              <CartesianGrid
                className="stroke-border/60 stroke-1"
                horizontal
                vertical={false}
              />
            ) : null}
            <XAxis
              dataKey={index}
              hide={!showXAxis}
              padding={{ left: paddingValue, right: paddingValue }}
              tick={{ transform: 'translate(0, 6)' }}
              tickLine={false}
              axisLine={false}
              minTickGap={5}
              className="fill-muted-foreground text-xs"
              stroke=""
            />
            <YAxis
              width={yAxisWidth}
              hide={!showYAxis}
              axisLine={false}
              tickLine={false}
              type="number"
              domain={yAxisDomain as AxisDomain}
              tick={{ transform: 'translate(-3, 0)' }}
              tickFormatter={valueFormatter}
              className="fill-muted-foreground text-xs"
              stroke=""
            />
            {showTooltip ? (
              <Tooltip
                wrapperStyle={{ outline: 'none' }}
                isAnimationActive
                animationDuration={100}
                cursor={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
                offset={20}
                position={{ y: 0 }}
                content={({ active, payload, label }) => {
                  const cleaned: PayloadItem[] = payload
                    ? payload.map((item: any) => ({
                        category: item.dataKey,
                        value: item.value,
                        index: item.payload[index],
                        color: categoryColors.get(
                          item.dataKey,
                        ) as AvailableChartColorsKeys,
                      }))
                    : []
                  return (
                    <ChartTooltip
                      active={active}
                      payload={cleaned}
                      label={String(label)}
                      valueFormatter={valueFormatter}
                    />
                  )
                }}
              />
            ) : null}
            {showLegend ? (
              <RechartsLegend
                verticalAlign="top"
                height={40}
                content={({ payload }) => (
                  <div className="flex justify-end">
                    <FlatLegend
                      items={(payload ?? [])
                        .filter((p: any) => p.type !== 'none')
                        .map((p: any) => ({
                          name: String(p.value),
                          color: categoryColors.get(
                            String(p.value),
                          ) as AvailableChartColorsKeys,
                        }))}
                    />
                  </div>
                )}
              />
            ) : null}
            {categories.map((category) => {
              const color = categoryColors.get(
                category,
              ) as AvailableChartColorsKeys
              const gradId = `${areaId}-${category.replace(/[^a-zA-Z0-9]/g, '')}`
              return (
                <React.Fragment key={category}>
                  <defs>
                    <linearGradient
                      id={gradId}
                      className={getColorClassName(color, 'text')}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      {fill === 'gradient' ? (
                        <>
                          <stop offset="5%" stopColor="currentColor" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="currentColor" stopOpacity={0} />
                        </>
                      ) : fill === 'solid' ? (
                        <stop stopColor="currentColor" stopOpacity={0.3} />
                      ) : (
                        <stop stopColor="currentColor" stopOpacity={0} />
                      )}
                    </linearGradient>
                  </defs>
                  <Area
                    className={getColorClassName(color, 'stroke')}
                    type="linear"
                    dataKey={category}
                    name={category}
                    stroke=""
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    isAnimationActive={false}
                    connectNulls={connectNulls}
                    stackId={stacked ? 'stack' : undefined}
                    fill={`url(#${gradId})`}
                    dot={false}
                    activeDot={{ r: 4, className: cn('stroke-background', getColorClassName(color, 'fill')) }}
                  />
                </React.Fragment>
              )
            })}
          </RechartsAreaChart>
        </ResponsiveContainer>
      </div>
    )
  },
)

AreaChart.displayName = 'AreaChart'
