// Color palette + helpers ported from Tremor Raw (v0.1.0). Covers the
// utilities needed by Category Bar / Area Chart / Bar Chart: class lookup
// for bg/text/stroke/fill, category→color mapping, y-axis domain
// computation, and a single-value-per-key detector for Area dot rendering.

export type AvailableChartColorsKeys =
  | 'blue'
  | 'emerald'
  | 'violet'
  | 'amber'
  | 'gray'
  | 'cyan'
  | 'pink'
  | 'lime'
  | 'fuchsia'
  | 'rose'

export const AvailableChartColors: AvailableChartColorsKeys[] = [
  'blue',
  'emerald',
  'violet',
  'amber',
  'gray',
  'cyan',
  'pink',
  'lime',
  'fuchsia',
  'rose',
]

type ColorClassMap = {
  bg: string
  text: string
  stroke: string
  fill: string
}

// Hardcoded so Tailwind's content scanner sees every class literally and
// emits the correct utilities at build time.
const COLOR_CLASSES: Record<AvailableChartColorsKeys, ColorClassMap> = {
  blue: {
    bg: 'bg-blue-500 dark:bg-blue-500',
    text: 'text-blue-500 dark:text-blue-500',
    stroke: 'stroke-blue-500 dark:stroke-blue-500',
    fill: 'fill-blue-500 dark:fill-blue-500',
  },
  emerald: {
    bg: 'bg-emerald-500 dark:bg-emerald-500',
    text: 'text-emerald-500 dark:text-emerald-500',
    stroke: 'stroke-emerald-500 dark:stroke-emerald-500',
    fill: 'fill-emerald-500 dark:fill-emerald-500',
  },
  violet: {
    bg: 'bg-violet-500 dark:bg-violet-500',
    text: 'text-violet-500 dark:text-violet-500',
    stroke: 'stroke-violet-500 dark:stroke-violet-500',
    fill: 'fill-violet-500 dark:fill-violet-500',
  },
  amber: {
    bg: 'bg-amber-500 dark:bg-amber-500',
    text: 'text-amber-500 dark:text-amber-500',
    stroke: 'stroke-amber-500 dark:stroke-amber-500',
    fill: 'fill-amber-500 dark:fill-amber-500',
  },
  gray: {
    bg: 'bg-gray-400 dark:bg-gray-500',
    text: 'text-gray-500 dark:text-gray-400',
    stroke: 'stroke-gray-500 dark:stroke-gray-400',
    fill: 'fill-gray-500 dark:fill-gray-400',
  },
  cyan: {
    bg: 'bg-cyan-500 dark:bg-cyan-500',
    text: 'text-cyan-500 dark:text-cyan-500',
    stroke: 'stroke-cyan-500 dark:stroke-cyan-500',
    fill: 'fill-cyan-500 dark:fill-cyan-500',
  },
  pink: {
    bg: 'bg-pink-500 dark:bg-pink-500',
    text: 'text-pink-500 dark:text-pink-500',
    stroke: 'stroke-pink-500 dark:stroke-pink-500',
    fill: 'fill-pink-500 dark:fill-pink-500',
  },
  lime: {
    bg: 'bg-lime-500 dark:bg-lime-500',
    text: 'text-lime-500 dark:text-lime-500',
    stroke: 'stroke-lime-500 dark:stroke-lime-500',
    fill: 'fill-lime-500 dark:fill-lime-500',
  },
  fuchsia: {
    bg: 'bg-fuchsia-500 dark:bg-fuchsia-500',
    text: 'text-fuchsia-500 dark:text-fuchsia-500',
    stroke: 'stroke-fuchsia-500 dark:stroke-fuchsia-500',
    fill: 'fill-fuchsia-500 dark:fill-fuchsia-500',
  },
  rose: {
    bg: 'bg-rose-500 dark:bg-rose-500',
    text: 'text-rose-500 dark:text-rose-500',
    stroke: 'stroke-rose-500 dark:stroke-rose-500',
    fill: 'fill-rose-500 dark:fill-rose-500',
  },
}

export function getColorClassName(
  color: AvailableChartColorsKeys,
  type: keyof ColorClassMap,
): string {
  return COLOR_CLASSES[color]?.[type] ?? ''
}

export function constructCategoryColors(
  categories: string[],
  colors: AvailableChartColorsKeys[],
): Map<string, AvailableChartColorsKeys> {
  const categoryColors = new Map<string, AvailableChartColorsKeys>()
  categories.forEach((category, index) => {
    categoryColors.set(category, colors[index % colors.length])
  })
  return categoryColors
}

export function getYAxisDomain(
  autoMinValue: boolean,
  minValue: number | undefined,
  maxValue: number | undefined,
): [number | 'auto' | 'dataMin', number | 'auto' | 'dataMax'] {
  const minDomain = autoMinValue ? 'auto' : (minValue ?? 0)
  const maxDomain = maxValue ?? 'auto'
  return [minDomain, maxDomain]
}

export function hasOnlyOneValueForKey(
  array: Record<string, unknown>[],
  keyToCheck: string,
): boolean {
  const unique = new Set()
  for (const row of array) {
    if (Object.prototype.hasOwnProperty.call(row, keyToCheck)) {
      unique.add(row[keyToCheck])
      if (unique.size > 1) return false
    }
  }
  return unique.size === 1
}
