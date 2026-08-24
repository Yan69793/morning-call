import { useState } from 'react'
import type { Regime } from '../types'

interface Filters {
  minScore: number
  maxScore: number
  regime: Regime | 'todos'
  type: string
  search: string
}

interface Props {
  onFilterChange: (filters: Filters) => void
}

export function WatchlistFilters({ onFilterChange }: Props) {
  const [minScore, setMinScore] = useState(-100)
  const [maxScore, setMaxScore] = useState(100)
  const [regime, setRegime] = useState<Regime | 'todos'>('todos')
  const [type, setType] = useState('todos')
  const [search, setSearch] = useState('')

  const regimes: (Regime | 'todos')[] = ['todos', 'ALTA', 'NEUTRO', 'BAIXA', 'TRANQUILO']
  const types = ['todos', 'acao', 'macro', 'rates', 'fx', 'commodity', 'cripto', 'indice', 'vix']

  const updateFilters = () => {
    onFilterChange({ minScore, maxScore, regime, type, search })
  }

  return (
    <div className="bg-bg-card dark:bg-dark-bg-card border border-bg-border dark:border-dark-bg-border rounded-xl p-3 space-y-3">
      <div className="text-[10px] font-semibold text-text-muted dark:text-dark-text-muted uppercase tracking-widest">
        Filtros
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Buscar ativo..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          updateFilters()
        }}
        className="w-full px-3 py-2 text-sm border border-bg-border dark:border-dark-bg-border rounded-lg bg-bg dark:bg-dark-bg text-text-primary dark:text-dark-text-primary placeholder:text-text-muted dark:placeholder:text-dark-text-muted"
      />

      {/* Score range */}
      <div className="space-y-2">
        <label className="text-[10px] text-text-muted dark:text-dark-text-muted">Score: {minScore} a {maxScore}</label>
        <div className="flex gap-2">
          <input
            type="number"
            value={minScore}
            onChange={(e) => {
              setMinScore(Number(e.target.value))
              updateFilters()
            }}
            className="w-20 px-2 py-1 text-sm border border-bg-border dark:border-dark-bg-border rounded bg-bg dark:bg-dark-bg text-text-primary dark:text-dark-text-primary"
            placeholder="Min"
          />
          <input
            type="number"
            value={maxScore}
            onChange={(e) => {
              setMaxScore(Number(e.target.value))
              updateFilters()
            }}
            className="w-20 px-2 py-1 text-sm border border-bg-border dark:border-dark-bg-border rounded bg-bg dark:bg-dark-bg text-text-primary dark:text-dark-text-primary"
            placeholder="Max"
          />
        </div>
      </div>

      {/* Regime filter */}
      <div className="space-y-2">
        <label className="text-[10px] text-text-muted dark:text-dark-text-muted">Regime</label>
        <select
          value={regime}
          onChange={(e) => {
            setRegime(e.target.value as Regime | 'todos')
            updateFilters()
          }}
          className="w-full px-3 py-2 text-sm border border-bg-border dark:border-dark-bg-border rounded-lg bg-bg dark:bg-dark-bg text-text-primary dark:text-dark-text-primary"
        >
          {regimes.map(r => (
            <option key={r} value={r}>{r === 'todos' ? 'Todos' : r}</option>
          ))}
        </select>
      </div>

      {/* Type filter */}
      <div className="space-y-2">
        <label className="text-[10px] text-text-muted dark:text-dark-text-muted">Tipo</label>
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value)
            updateFilters()
          }}
          className="w-full px-3 py-2 text-sm border border-bg-border dark:border-dark-bg-border rounded-lg bg-bg dark:bg-dark-bg text-text-primary dark:text-dark-text-primary"
        >
          {types.map(t => (
            <option key={t} value={t}>{t === 'todos' ? 'Todos' : t}</option>
          ))}
        </select>
      </div>

      {/* Clear button */}
      <button
        onClick={() => {
          setMinScore(-100)
          setMaxScore(100)
          setRegime('todos')
          setType('todos')
          setSearch('')
          onFilterChange({ minScore: -100, maxScore: 100, regime: 'todos', type: 'todos', search: '' })
        }}
        className="w-full px-3 py-2 text-sm text-text-muted dark:text-dark-text-muted border border-bg-border dark:border-dark-bg-border rounded-lg hover:bg-bg-hover dark:hover:bg-dark-bg-hover transition-colors"
      >
        Limpar filtros
      </button>
    </div>
  )
}
