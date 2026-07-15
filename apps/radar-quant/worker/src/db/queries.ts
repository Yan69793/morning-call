import type { D1Database } from '@cloudflare/workers-types'

export async function getLatestScan(db: D1Database) {
  return db.prepare(
    'SELECT payload FROM scans ORDER BY market_date DESC LIMIT 1'
  ).first<{ payload: string }>()
}

export async function getScanByDate(db: D1Database, date: string) {
  return db.prepare(
    'SELECT payload FROM scans WHERE market_date = ?'
  ).bind(date).first<{ payload: string }>()
}

export async function listScanDates(db: D1Database) {
  return db.prepare(
    'SELECT scan_id, market_date, generated_at FROM scans ORDER BY market_date DESC LIMIT 90'
  ).all<{ scan_id: string; market_date: string; generated_at: string }>()
}

export async function insertScan(
  db: D1Database,
  scanId: string,
  marketDate: string,
  generatedAt: string,
  schemaVersion: string,
  payload: string
) {
  return db.prepare(
    `INSERT OR REPLACE INTO scans (scan_id, market_date, generated_at, schema_version, payload)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(scanId, marketDate, generatedAt, schemaVersion, payload).run()
}

export async function insertSignal(
  db: D1Database,
  signalId: string,
  symbol: string,
  mode: string,
  verdict: string,
  marketDate: string,
  generatedAt: string,
  payload: string
) {
  return db.prepare(
    `INSERT OR REPLACE INTO signals (signal_id, symbol, mode, verdict, market_date, generated_at, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(signalId, symbol, mode, verdict, marketDate, generatedAt, payload).run()
}

export async function getSignalById(db: D1Database, signalId: string) {
  return db.prepare(
    'SELECT payload FROM signals WHERE signal_id = ?'
  ).bind(signalId).first<{ payload: string }>()
}
