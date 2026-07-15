export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-bg-border dark:bg-dark-bg-border rounded ${className}`} />
  )
}
