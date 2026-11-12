import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Alert, Empty } from '../../components/ui.jsx'
import { useOrders } from '../../hooks/useOrders.js'
import { rpc } from '../../lib/supabase.js'
import { addDaysISO, formatDate, formatMoney, formatTime, STATUS_LABEL, todayISO } from '../../lib/format.js'
import { itemsSummary, PROGRESS, progressIndex } from '../../lib/orders.js'

/** CAF-06: el cliente consulta el estado de su pedido con su número de turno, en tiempo real. */
export default function MyOrders() {
  const location = useLocation()
  const created = location.state?.created
  const today = todayISO()
  const { orders, loading, error, reload } = useOrders({ days: [today, addDaysISO(today, 1)] })
  const [actionError, setActionError] = useState(null)

  const active = orders.filter((o) => !['entregado', 'cancelado'].includes(o.status))
  const past = orders.filter((o) => ['entregado', 'cancelado'].includes(o.status)).reverse()

  async function cancel(order) {
    if (!window.confirm(`¿Cancelar el pedido con turno ${order.turn_number}?`)) return
    try {
      await rpc('cancel_order', { p_order_id: order.id, p_reason: 'Cancelado por el cliente' })
      reload()
    } catch (e) {
      setActionError(e.message)
    }
  }

  return (
    <div className="narrow">
      <h1>Mis pedidos</h1>
      {created && (
        <Alert kind="success">
          ¡Pedido recibido! Tu turno es el <strong>{created.turn_number}</strong>. Recógelo a las{' '}
          {formatTime(created.pickup_slot)} y paga al recibirlo.
        </Alert>
      )}
      <Alert>{error}</Alert>
      <Alert onClose={() => setActionError(null)}>{actionError}</Alert>

      {loading ? (
        <p className="muted">Cargando…</p>
      ) : active.length === 0 ? (
        <Empty>
          No tienes pedidos en curso. <Link to="/menu">Haz uno aquí</Link>.
        </Empty>
      ) : (
        active.map((o) => (
          <article key={o.id} className={`card order-status ${o.status}`}>
            <div className="order-status-head">
              <div>
                <div className="muted small">Turno</div>
                <div className="turn-big">{o.turn_number}</div>
              </div>
              <div className="right">
                <div className="status-label">{STATUS_LABEL[o.status]}</div>
                <div className="muted small">
                  Recoger {o.order_day !== today ? formatDate(o.pickup_slot) + ' · ' : ''}
                  {formatTime(o.pickup_slot)}
                </div>
              </div>
            </div>

            {o.status === 'listo' && <div className="ready-banner">¡Tu pedido está listo! Acércate a la barra.</div>}

            <ol className="progress" aria-label="Estado del pedido">
              {PROGRESS.map((s, i) => (
                <li key={s} className={i <= progressIndex(o.status) ? 'done' : ''}>
                  {STATUS_LABEL[s]}
                </li>
              ))}
            </ol>

            <p>{itemsSummary(o)}</p>
            <div className="row-between">
              <strong>{formatMoney(o.total)}</strong>
              {o.status === 'recibido' && (
                <button className="btn btn-ghost btn-sm" onClick={() => cancel(o)}>
                  Cancelar
                </button>
              )}
            </div>
          </article>
        ))
      )}

      {past.length > 0 && (
        <>
          <h2>Anteriores</h2>
          <ul className="list">
            {past.map((o) => (
              <li key={o.id} className="list-row">
                <span>
                  Turno {o.turn_number} · {itemsSummary(o)}
                </span>
                <span className="muted">
                  {STATUS_LABEL[o.status]} · {formatMoney(o.total)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
