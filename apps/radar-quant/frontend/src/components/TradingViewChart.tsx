import { useEffect, useRef } from 'react'

export function TradingViewChart({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const container = ref.current
    if (!container) return
    container.innerHTML = ''
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.async = true
    script.innerHTML = JSON.stringify({
      symbol,
      interval: 'D',
      theme: 'dark',
      style: '1',
      locale: 'br',
      timezone: 'America/Sao_Paulo',
      hide_side_toolbar: false,
      allow_symbol_change: true,
      studies: ['RSI@tv-basicstudies', 'MACD@tv-basicstudies'],
      autosize: true,
    })
    container.appendChild(script)
    return () => { container.innerHTML = '' }
  }, [symbol])
  return <div className="tradingview-widget-container h-full w-full" ref={ref} />
}
