import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, rpc } from '../lib/supabase.js'

const CashContext = createContext({ status: null, isOpen: false, loading: true, reload: () => {} })

/**
 * Estado de la caja para todo el personal, en tiempo real (CAF-09, RN-A5).
 * Si la administradora la cierra, la caja y la barra se bloquean al instante.
 */
export function CashProvider({ enabled, children }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      setStatus(await rpc('cash_status', {}))
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return undefined
    reload()
    const channel = supabase
      .channel(`cash-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_sessions' }, reload)
      .subscribe()
    const poll = setInterval(reload, 30000)
    return () => {
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [enabled, reload])

  return (
    <CashContext.Provider value={{ status, isOpen: Boolean(status?.is_open), loading, reload }}>
      {children}
    </CashContext.Provider>
  )
}

export function useCash() {
  return useContext(CashContext)
}
