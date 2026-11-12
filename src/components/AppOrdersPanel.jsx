import { Link } from 'react-router-dom'
import { useOrders } from '../hooks/useOrders.js'
import { addDaysISO, formatTime, STATUS_LABEL, todayISO } from '../lib/format.js'
import { itemsSummary, sortForBar } from '../lib/orders.js'

/** Pedidos hechos desde la app que aún no se entregan, visibles desde la caja. */
export default function AppOrdersPanel() {
  const today = todayISO()
  const { orders } = useOrders({ days: [today, addDaysISO(today, 1)] })
  const pending = sortForBar(
    orders.filter((o) => o.channel === 'anticipado' && !['entregado', 'cancelado'].includes(o.status)),
  )

  return (
    <section className="card">
      <div className="row-between">
        <h2>Pedidos de la app</h2>
        <Link to="/barra" className="btn btn-ghost btn-sm">
          Ir a la barra
        </Link>
      </div>
      {pending.length === 0 ? (
        <p className="muted small">No hay pedidos de la app pendientes.</p>
      ) : (
        <ul className="list">
          {pending.map((o) => (
            <li key={o.id} className="app-order">
              <div className="row-between">
                <strong>
                  #{o.turn_number} · {o.customer_name}
                </strong>
                <span className={`tag status-${o.status}`}>{STATUS_LABEL[o.status]}</span>
              </div>
              <div className="small">{itemsSummary(o)}</div>
              <div className="small muted">
                Recoge {o.order_day !== today ? 'mañana ' : ''}
                {formatTime(o.pickup_slot)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
