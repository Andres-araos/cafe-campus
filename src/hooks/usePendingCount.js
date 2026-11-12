import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { todayISO } from '../lib/format.js'

/** Cantidad de pedidos de hoy en "Recibido", para el contador de la pestaña Barra. */
export function usePendingCount(enabled) {
  const [count, setCount] = useState(0)

  const load = useCallback(async () => {
    const { count: n } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('order_day', todayISO())
      .eq('status', 'recibido')
    setCount(n || 0)
  }, [])

  useEffect(() => {
    if (!enabled) return undefined
    load()
    const channel = supabase
      .channel(`pending-count-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .subscribe()
    const poll = setInterval(load, 30000)
    return () => {
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [enabled, load])

  return count
}
