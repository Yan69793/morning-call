interface Props { score: number }

export function ScoreMeter({ score }: Props) {
  const pct = ((score + 100) / 200) * 100
  const color =
    score >= 80  ? '#00ff88' :
    score > 30   ? '#16a34a' :
    score < -80  ? '#ff4455' :
    score < -30  ? '#dc2626' : '#94a3b8'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-bg-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="font-mono text-xs w-8 text-right font-medium" style={{ color }}>
        {score > 0 ? '+' : ''}{score}
      </span>
    </div>
  )
}
