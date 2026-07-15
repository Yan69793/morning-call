-- Migration 0001: schema inicial
-- Criado em: sprint 2

CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id TEXT NOT NULL UNIQUE,
  market_date TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scans_market_date ON scans(market_date DESC);

CREATE TABLE IF NOT EXISTS optimization_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uploaded_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
