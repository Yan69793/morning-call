import { useState, useEffect, useCallback } from 'react'

interface ApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export function useApi<T>(url: string, intervalMs?: number): ApiState<T> & { reload: () => void } {
  const [state, setState] = useState<ApiState<T>>({ data: null, loading: true, error: null })

  const load = useCallback(async () => {
    try {
      const base = import.meta.env.VITE_API_URL ?? ''
      const res = await fetch(base + url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: T = await res.json()
      setState({ data, loading: false, error: null })
    } catch (e) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : 'Erro desconhecido',
      }))
    }
  }, [url])

  useEffect(() => {
    setState(prev => ({ ...prev, loading: true }))
    void load()
    if (!intervalMs) return
    const t = setInterval(() => void load(), intervalMs)
    return () => clearInterval(t)
  }, [url, intervalMs, load])

  return { ...state, reload: load }
}
