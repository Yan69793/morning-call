import { Skeleton } from './Skeleton'

export function SkeletonWatchlistItem() {
  return (
    <div className="flex items-center gap-2 w-full px-3 py-2">
      {/* Ticker + nome */}
      <div className="min-w-0 flex-1 space-y-1">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-2 w-20" />
      </div>

      {/* Regime */}
      <Skeleton className="h-5 w-12 rounded-full" />

      {/* Preço + 1D */}
      <div className="flex flex-col items-end gap-1 w-16">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-2 w-10" />
      </div>

      {/* Score */}
      <Skeleton className="h-3 w-7" />
    </div>
  )
}
