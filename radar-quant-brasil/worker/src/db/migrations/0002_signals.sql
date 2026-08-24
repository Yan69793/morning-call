-- Migration 0002: tabela de sinais (planos de trade)
CREATE TABLE IF NOT EXISTS signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('intraday','swing')),
  verdict TEXT NOT NULL CHECK(verdict IN ('COMPRAR','AGUARDAR','VENDER')),
  market_date TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);
CREATE INDEX IF NOT EXISTS idx_signals_market_date ON signals(market_date DESC);
CREATE INDEX IF NOT EXISTS idx_signals_mode ON signals(mode);
