import { useState, useEffect } from 'react'
import { useApi } from '../hooks/useApi'
import { ScanDiff } from '../components/ScanDiff'
import type { ScanDocument } from '../types'

interface DateEntry {
  scan_id: string
  market_date: string
  generated_at: string
}

async function fetchScan(date: string): Promise<ScanDocument | null> {
  try {
    const res = await fetch(`/api/radar/${date}`)
    if (!res.ok) return null
    return res.json() as Promise<ScanDocument>
  } catch {
    return null
  }
}

const selectCls = 'border border-bg-border rounded-lg px-3 py-1.5 text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-blue/20 focus:border-accent-blue'

export function History() {
  const { data: dates, loading: loadingDates } = useApi<DateEntry[]>('/api/radar/dates')
  const [dateA, setDateA] = useState('')
  const [dateB, setDateB] = useState('')
  const [scanA, setScanA] = useState<ScanDocument | null>(null)
  const [scanB, setScanB] = useState<ScanDocument | null>(null)
  const [loadingA, setLoadingA] = useState(false)
  const [loadingB, setLoadingB] = useState(false)

  useEffect(() => {
    if (!dates?.length) return
    const a = dates[0].market_date
    const b = dates[1]?.market_date ?? dates[0].market_date
    Promise.resolve().then(() => {
      setDateA(a)
      setDateB(b)
    })
  }, [dates])

  useEffect(() => {
    if (!dateA) return
    let cancelled = false
    const load = async () => {
      setLoadingA(true)
      const result = await fetchScan(dateA)
      if (!cancelled) {
        setScanA(result)
        setLoadingA(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [dateA])

  useEffect(() => {
    if (!dateB) return
    let cancelled = false
    const load = async () => {
      setLoadingB(true)
      const result = await fetchScan(dateB)
      if (!cancelled) {
        setScanB(result)
        setLoadingB(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [dateB])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Histórico de Scans</h1>
        <p className="text-xs text-text-muted mt-0.5">Compare scores e regimes entre duas datas</p>
      </div>

      {/* Seletor de datas */}
      <div className="flex flex-wrap items-end gap-4 p-4 bg-white border border-bg-border rounded-xl">
        <div>
          <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-1.5">Data A (mais recente)</label>
          <select className={selectCls} value={dateA} onChange={e => setDateA(e.target.value)} disabled={loadingDates}>
            {dates?.map(d => <option key={d.market_date} value={d.market_date}>{d.market_date}</option>)}
          </select>
        </div>
        <div className="text-text-dim text-sm pb-1.5">vs</div>
        <div>
          <label className="block text-[10px] text-text-muted uppercase tracking-wide mb-1.5">Data B (comparação)</label>
          <select className={selectCls} value={dateB} onChange={e => setDateB(e.target.value)} disabled={loadingDates}>
            {dates?.map(d => <option key={d.market_date} value={d.market_date}>{d.market_date}</option>)}
          </select>
        </div>
        {scanA && scanB && (
          <div className="ml-auto self-end text-xs text-text-muted">
            {scanA.items.length} ativos em A · {scanB.items.length} em B
          </div>
        )}
      </div>

      {(loadingA || loadingB) && (
        <div className="text-text-muted text-sm text-center py-6">Carregando scans...</div>
      )}

      {!loadingA && !loadingB && scanA && scanB && (
        <div className="bg-white border border-bg-border rounded-xl overflow-hidden">
          <ScanDiff a={scanA.items} b={scanB.items} dateA={dateA} dateB={dateB} />
        </div>
      )}

      {!loadingDates && !dates?.length && (
        <div className="text-text-muted text-sm text-center py-8">
          Nenhum scan histórico disponível.
        </div>
      )}
    </div>
  )
}
