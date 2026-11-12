import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { formatDate, formatMoney, formatTime, todayISO } from '../lib/format.js'
import { chime } from '../lib/sound.js'

const VISIBLE_MS = 20000

/**
 * Aviso para el personal cuando entra un pedido (CAF-04): aparece en cualquier pantalla
 * con el nombre del cliente, el turno, lo que pidió y la hora de recogida.
 */
export default function NewOrderAlerts() {
  const [alerts, setAlerts] = useState([])
  const timers = useRef(new Map())

  useEffect(() => {
    const dismissLater = (id) => {
      timers.current.set(
        id,
        setTimeout(() => setAlerts((a) => a.filter((x) => x.id !== id)), VISIBLE_MS),
      )
    }

    const channel = supabase
      .channel(`new-orders-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, async ({ new: order }) => {
        // Los pedidos en caja los registra el mismo personal: solo se avisan los que llegan por la app
        if (order.channel !== 'anticipado' || order.is_demo) return
        const { data: items } = await supabase
          .from('order_items')
          .select('product_name, quantity')
          .eq('order_id', order.id)
        setAlerts((a) => [{ ...order, items: items || [] }, ...a].slice(0, 4))
        dismissLater(order.id)
        chime()
      })
      .subscribe()

    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      supabase.removeChannel(channel)
    }
  }, [])

  if (alerts.length === 0) return null

  const close = (id) => {
    clearTimeout(timers.current.get(id))
    setAlerts((a) => a.filter((x) => x.id !== id))
  }

  return (
    <div className="toasts" aria-live="assertive">
      {alerts.map((o) => (
        <div key={o.id} className="toast" role="alert">
          <div className="toast-head">
            <strong>Nuevo pedido · turno {o.turn_number}</strong>
            <button className="alert-close" onClick={() => close(o.id)} aria-label="Cerrar aviso">
              ×
            </button>
          </div>
          <div className="toast-customer">{o.customer_name}</div>
          <div className="small">{o.items.map((i) => `${i.quantity} × ${i.product_name}`).join(', ')}</div>
          <div className="small muted">
            Recoge {o.order_day !== todayISO() ? `${formatDate(o.pickup_slot)} · ` : ''}
            {formatTime(o.pickup_slot)} · {formatMoney(o.total)}
          </div>
          <Link to="/barra" className="btn btn-primary btn-sm" onClick={() => close(o.id)}>
            Ver en la barra
          </Link>
        </div>
      ))}
    </div>
  )
}
