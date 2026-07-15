import type { NewsItem, RadarItem } from '../types'

interface Props {
  item: RadarItem
  news: NewsItem[]
  onClose: () => void
}

export function NewsPanel({ item, news, onClose }: Props) {
  const ticker = item.symbol.includes(':') ? item.symbol.split(':')[1] : item.symbol

  return (
    <div className="flex flex-col h-full bg-bg-card border-l border-bg-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-bg-border shrink-0">
        <div>
          <div className="text-xs font-semibold text-text-primary">{item.name}</div>
          <div className="text-[10px] text-text-muted">{ticker} · notícias</div>
        </div>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary transition-colors w-6 h-6 flex items-center justify-center"
          aria-label="Fechar"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {news.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-[11px] text-text-muted">
            Sem notícias para {ticker}
          </div>
        ) : (
          news.map((n, i) => (
            <div key={i} className="bg-bg border border-bg-border rounded p-3 space-y-1.5">
              {n.url ? (
                <a
                  href={n.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-text-primary hover:text-accent-yellow transition-colors leading-snug block"
                >
                  {n.title}
                </a>
              ) : (
                <p className="text-xs font-medium text-text-primary leading-snug">{n.title}</p>
              )}
              {n.summary && (
                <p className="text-[10px] text-text-muted leading-relaxed">{n.summary}</p>
              )}
              <div className="text-[10px] text-text-muted">
                {n.source} · {n.publishedAt}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
