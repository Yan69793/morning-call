import { Skeleton } from './Skeleton'

export function SkeletonAssetCard() {
  return (
    <div className="bg-bg-card dark:bg-dark-bg-card rounded-xl border border-bg-border dark:border-dark-bg-border p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="flex flex-col gap-1">
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="h-3 w-3 rounded-full" />
        </div>
      </div>

      {/* Preço */}
      <Skeleton className="h-7 w-20" />

      {/* Score */}
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-3 w-32" />

      {/* Variações */}
      <div className="grid grid-cols-4 gap-1 pt-1 border-t border-bg-border dark:border-dark-bg-border">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex flex-col items-center gap-1">
            <Skeleton className="h-3 w-6" />
            <Skeleton className="h-4 w-8" />
          </div>
        ))}
      </div>
    </div>
  )
}
