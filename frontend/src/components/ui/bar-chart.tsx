/* eslint-disable @typescript-eslint/no-explicit-any */
// Ported from Tremor Raw BarChart v1.0.0 with the same simplifications as
// area-chart.tsx: `cx` → `cn`, no Legend slider, no onValueChange / active-
// bar click interactivity. Keeps stacked / percent / vertical layouts.

import React from 'react'
import {
  Bar,
  CartesianGrid,
  BarChart as RechartsBarChart,
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

type LegendItemEntry = { name: string; color: AvailableChartColorsKeys }

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
              'size-2 shrink-0 rounded-xs',
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
          <div key={i} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  'size-2 shrink-0 rounded-xs',
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

interface BarChartProps extends React.HTMLAttributes<HTMLDivElement> {
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
  barCategoryGap?: string | number
  layout?: 'vertical' | 'horizontal'
  type?: 'default' | 'stacked' | 'percent'
}

export const BarChart = React.forwardRef<HTMLDivElement, BarChartProps>(
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
      barCategoryGap,
      className,
      layout = 'horizontal',
      type = 'default',
      ...rest
    } = props

    const categoryColors = constructCategoryColors(categories, colors)
    const yAxisDomain = getYAxisDomain(autoMinValue, minValue, maxValue)
    const stacked = type === 'stacked' || type === 'percent'
    const paddingValue = !showXAxis && !showYAxis ? 0 : 20
    const valueToPercent = (value: number) =>
      `${(value * 100).toFixed(0)}%`

    return (
      <div ref={ref} className={cn('h-72 w-full', className)} {...rest}>
        <ResponsiveContainer>
          <RechartsBarChart
            data={data}
            margin={{ top: 5 }}
            stackOffset={type === 'percent' ? 'expand' : undefined}
            layout={layout}
            barCategoryGap={barCategoryGap}
          >
            {showGridLines ? (
              <CartesianGrid
                className="stroke-border/60 stroke-1"
                horizontal={layout !== 'vertical'}
                vertical={layout === 'vertical'}
              />
            ) : null}
            <XAxis
              hide={!showXAxis}
              tickLine={false}
              axisLine={false}
              minTickGap={5}
              tick={{
                transform:
                  layout !== 'vertical' ? 'translate(0, 6)' : undefined,
              }}
              className="fill-muted-foreground text-xs"
              stroke=""
              {...(layout !== 'vertical'
                ? {
                    padding: { left: paddingValue, right: paddingValue },
                    dataKey: index,
                  }
                : {
                    type: 'number',
                    domain: yAxisDomain as AxisDomain,
                    tickFormatter:
                      type === 'percent' ? valueToPercent : valueFormatter,
                  })}
            />
            <YAxis
              width={yAxisWidth}
              hide={!showYAxis}
              axisLine={false}
              tickLine={false}
              tick={{
                transform:
                  layout !== 'vertical'
                    ? 'translate(-3, 0)'
                    : 'translate(0, 0)',
              }}
              className="fill-muted-foreground text-xs"
              stroke=""
              {...(layout !== 'vertical'
                ? {
                    type: 'number',
                    domain: yAxisDomain as AxisDomain,
                    tickFormatter:
                      type === 'percent' ? valueToPercent : valueFormatter,
                  }
                : {
                    dataKey: index,
                    type: 'category',
                  })}
            />
            {showTooltip ? (
              <Tooltip
                wrapperStyle={{ outline: 'none' }}
                isAnimationActive
                animationDuration={100}
                cursor={{ fill: 'currentColor', opacity: 0.1 }}
                offset={20}
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
            {categories.map((category) => (
              <Bar
                key={category}
                className={getColorClassName(
                  categoryColors.get(category) as AvailableChartColorsKeys,
                  'fill',
                )}
                name={category}
                dataKey={category}
                stackId={stacked ? 'stack' : undefined}
                isAnimationActive={false}
                fill=""
              />
            ))}
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
    )
  },
)

BarChart.displayName = 'BarChart'
