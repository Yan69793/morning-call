import { useEffect, useState } from 'react'
import { ThemeToggle } from '../ThemeToggle'

function getBRTTime(date: Date) {
  return date.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false })
}

function isMarketOpen(date: Date): boolean {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date)
  const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0')
  const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0')
  const totalMin = h * 60 + m
  return totalMin >= 600 && totalMin < 1075
}

export function TopBar() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const open = isMarketOpen(now)

  return (
    <header className="h-14 bg-bg-card dark:bg-dark-bg-card border-b border-bg-border dark:border-dark-bg-border flex items-center px-6 gap-4 shrink-0">
      <span className="text-text-primary dark:text-dark-text-primary font-semibold text-sm tracking-wide">Radar Quant Brasil</span>
      <div className="ml-auto flex items-center gap-4">
        <span className="font-mono text-xs text-text-muted dark:text-dark-text-muted">{getBRTTime(now)} BRT</span>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
          open
            ? 'bg-green-50 dark:bg-green-900/30 text-accent-green'
            : 'bg-gray-100 dark:bg-gray-800 text-text-muted dark:text-dark-text-muted'
        }`}>
          {open ? '● Aberto' : '○ Fechado'}
        </span>
        <ThemeToggle />
      </div>
    </header>
  )
}
