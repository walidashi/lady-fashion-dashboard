import { OrderStatus, STATUS_COLORS, STATUS_LABELS } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  status: OrderStatus
  className?: string
}

export default function OrderStatusBadge({ status, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border',
        STATUS_COLORS[status],
        className
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
