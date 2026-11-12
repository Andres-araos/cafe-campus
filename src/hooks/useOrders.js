import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, toAppError } from '../lib/supabase.js'

/**
 * Pedidos de uno o varios días con sus productos, actualizados en tiempo real.
 * RLS decide qué ve cada rol: el personal ve todos y el cliente solo los suyos.
 */
export function useOrders({ days }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const timer = useRef(null)
  const daysKey = days.join(',')

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('orders')
      .select('*, order_items(id, product_name, quantity, unit_price, subtotal)')
      .in('order_day', daysKey.split(','))
      .order('created_at', { ascending: true })
    if (err) setError(toAppError(err).message)
    else {
      setOrders(data)
      setError(null)
    }
    setLoading(false)
  }, [daysKey])

  useEffect(() => {
    load()
    // Agrupa ráfagas de cambios (por ejemplo, al preparar la demo) en una sola recarga
    const schedule = () => {
      clearTimeout(timer.current)
      timer.current = setTimeout(load, 250)
    }
    const channel = supabase
      .channel(`orders-${daysKey}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, schedule)
      .subscribe()
    // Respaldo por si la conexión en tiempo real se cae en la red de la universidad
    const poll = setInterval(load, 30000)
    return () => {
      clearTimeout(timer.current)
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [load, daysKey])

  return { orders, loading, error, reload: load }
}
