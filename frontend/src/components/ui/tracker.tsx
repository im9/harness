// Ported from Tremor Raw Tracker v1.0.0 with two local simplifications:
//   - `cx` → shadcn `cn`.
//   - Per-block HoverCard tooltip is dropped so we don't have to pull the
//     Radix HoverCard primitive for this spike; the `tooltip` prop is
//     accepted but only surfaced via the native title attribute.

import React from 'react'
import { cn } from '@/lib/utils'

interface TrackerBlockProps {
  key?: string | number
  color?: string
  tooltip?: string
  hoverEffect?: boolean
  defaultBackgroundColor?: string
}

function Block({
  color,
  tooltip,
  defaultBackgroundColor,
  hoverEffect,
}: TrackerBlockProps) {
  return (
    <div
      title={tooltip}
      className="size-full overflow-hidden px-[0.5px] transition first:rounded-l-[4px] first:pl-0 last:rounded-r-[4px] last:pr-0 sm:px-px"
    >
      <div
        className={cn(
          'size-full rounded-[1px]',
          color || defaultBackgroundColor,
          hoverEffect ? 'hover:opacity-50' : '',
        )}
      />
    </div>
  )
}

Block.displayName = 'Block'

interface TrackerProps extends React.HTMLAttributes<HTMLDivElement> {
  data: TrackerBlockProps[]
  defaultBackgroundColor?: string
  hoverEffect?: boolean
}

const Tracker = React.forwardRef<HTMLDivElement, TrackerProps>(
  (
    {
      data = [],
      defaultBackgroundColor = 'bg-gray-400 dark:bg-gray-500',
      className,
      hoverEffect,
      ...props
    },
    forwardedRef,
  ) => {
    return (
      <div
        ref={forwardedRef}
        data-slot="tracker"
        className={cn('group flex h-8 w-full items-center', className)}
        {...props}
      >
        {data.map((blockProps, index) => (
          <Block
            key={blockProps.key ?? index}
            defaultBackgroundColor={defaultBackgroundColor}
            hoverEffect={hoverEffect}
            {...blockProps}
          />
        ))}
      </div>
    )
  },
)

Tracker.displayName = 'Tracker'

export { Tracker, type TrackerBlockProps }
