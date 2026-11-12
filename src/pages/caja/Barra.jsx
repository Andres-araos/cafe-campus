import { useState } from 'react'
import { Alert, Empty, Modal } from '../../components/ui.jsx'
import CashClosedBanner from '../../components/CashClosedBanner.jsx'
import { useCash } from '../../context/CashContext.jsx'
import { useOrders } from '../../hooks/useOrders.js'
import { useNow } from '../../hooks/useNow.js'
import { rpc } from '../../lib/supabase.js'
import { addDaysISO, formatMoney, formatTime, minutesSince, todayISO } from '../../lib/format.js'
import { BOARD_COLUMNS, groupByStatus, NEXT_STATUS, PREV_STATUS, sortForBar } from '../../lib/orders.js'

const NEXT_LABEL = { recibido: 'Preparar', en_preparacion: 'Marcar listo' }

/**
 * CAF-04: tablero de pedidos por estados (recibido → en preparación → listo → entregado).
 * CAF-08: al entregar se registra el pago en efectivo o por transferencia.
 */
export default function Barra() {
  const today = todayISO()
  const tomorrow = addDaysISO(today, 1)
  // Se cargan también los de mañana: un cliente que pide de noche solo puede elegir franjas del día siguiente
  const { orders: allOrders, loading, error, reload } = useOrders({ days: [today, tomorrow] })
  const orders = allOrders.filter((o) => o.order_day === today)
  const upcoming = sortForBar(allOrders.filter((o) => o.order_day === tomorrow && o.status !== 'cancelado'))
  const now = useNow(30000)
  const { isOpen: cashOpen } = useCash()
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [delivering, setDelivering] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [reason, setReason] = useState('')

  const groups = groupByStatus(orders)
  const delivered = sortForBar(orders.filter((o) => o.status === 'entregado')).reverse().slice(0, 8)

  async function run(orderId, fn) {
    setActionError(null)
    setBusyId(orderId)
    try {
      await fn()
      await reload()
    } catch (e) {
      setActionError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  const move = (order, to) => run(order.id, () => rpc('move_order', { p_order_id: order.id, p_to_status: to }))

  async function deliver(method) {
    const order = delivering
    setDelivering(null)
    await run(order.id, () => rpc('deliver_order', { p_order_id: order.id, p_method: method }))
  }

  async function cancel() {
    const order = cancelling
    setCancelling(null)
    await run(order.id, () => rpc('cancel_order', { p_order_id: order.id, p_reason: reason }))
    setReason('')
  }

  return (
    <div>
      <div className="row-between">
        <h1>Barra</h1>
        <span className="muted small">Se actualiza solo · ordenado por hora de recogida</span>
      </div>
      <CashClosedBanner />
      <Alert>{error}</Alert>
      <Alert onClose={() => setActionError(null)}>{actionError}</Alert>

      {loading ? (
        <p className="muted">Cargando pedidos…</p>
      ) : (
        <div className="board">
          {BOARD_COLUMNS.map((col) => (
            <section key={col.status} className={`board-col col-${col.status}`}>
              <h2>
                {col.title} <span className="count">{groups[col.status].length}</span>
              </h2>
              {groups[col.status].length === 0 && <Empty>Sin pedidos</Empty>}
              {groups[col.status].map((o) => (
                <article key={o.id} className="ticket">
                  <div className="ticket-head">
                    <span className="ticket-turn">#{o.turn_number}</span>
                    {o.channel === 'anticipado' ? (
                      <span className="tag tag-advance">Recoge {formatTime(o.pickup_slot)}</span>
                    ) : (
                      <span className="tag">Caja · hace {minutesSince(o.created_at, now)} min</span>
                    )}
                  </div>
                  <div className="ticket-customer">{o.customer_name}</div>
                  <ul className="ticket-items">
                    {o.order_items.map((i) => (
                      <li key={i.id}>
                        <strong>{i.quantity}</strong> × {i.product_name}
                      </li>
                    ))}
                  </ul>
                  {o.notes && <div className="ticket-notes">Nota: {o.notes}</div>}
                  <div className="ticket-total">{formatMoney(o.total)}</div>
                  <div className="ticket-actions">
                    {PREV_STATUS[o.status] && (
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busyId === o.id || !cashOpen}
                        onClick={() => move(o, PREV_STATUS[o.status])}
                        title="Devolver al estado anterior"
                      >
                        ← Devolver
                      </button>
                    )}
                    {NEXT_STATUS[o.status] && (
                      <button className="btn btn-primary" disabled={busyId === o.id || !cashOpen} onClick={() => move(o, NEXT_STATUS[o.status])}>
                        {NEXT_LABEL[o.status]} →
                      </button>
                    )}
                    {o.status === 'listo' && (
                      <button className="btn btn-success" disabled={busyId === o.id || !cashOpen} onClick={() => setDelivering(o)}>
                        Entregar y cobrar
                      </button>
                    )}
                  </div>
                  {o.status !== 'listo' && (
                    <button className="link-btn" onClick={() => setCancelling(o)} disabled={busyId === o.id || !cashOpen}>
                      Cancelar pedido
                    </button>
                  )}
                </article>
              ))}
            </section>
          ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="card upcoming">
          <h2>
            Pedidos para mañana <span className="count">{upcoming.length}</span>
          </h2>
          <p className="muted small">Pasan al tablero automáticamente al iniciar el día.</p>
          <ul className="list">
            {upcoming.map((o) => (
              <li key={o.id} className="list-row">
                <span>
                  <strong>#{o.turn_number}</strong> · {o.customer_name} · {o.order_items.map((i) => `${i.quantity} × ${i.product_name}`).join(', ')}
                </span>
                <span className="row-end">
                  <span className="tag tag-advance">Recoge {formatTime(o.pickup_slot)}</span>
                  <button className="link-btn" onClick={() => setCancelling(o)} disabled={busyId === o.id || !cashOpen}>
                    Cancelar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {delivered.length > 0 && (
        <details className="card delivered">
          <summary>Entregados hoy ({orders.filter((o) => o.status === 'entregado').length})</summary>
          <ul className="list">
            {delivered.map((o) => (
              <li key={o.id} className="list-row">
                <span>
                  #{o.turn_number} · {o.customer_name}
                </span>
                <span className="muted">
                  {formatMoney(o.total)} · {formatTime(o.delivered_at)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {delivering && (
        <Modal title={`Entregar turno #${delivering.turn_number}`} onClose={() => setDelivering(null)}>
          <p>
            {delivering.customer_name} paga <strong className="big-money">{formatMoney(delivering.total)}</strong>
          </p>
          <div className="pay-buttons">
            <button className="btn btn-primary btn-lg" onClick={() => deliver('efectivo')}>
              Efectivo
            </button>
            <button className="btn btn-primary btn-lg" onClick={() => deliver('transferencia')}>
              Transferencia
            </button>
          </div>
        </Modal>
      )}

      {cancelling && (
        <Modal title={`Cancelar turno #${cancelling.turn_number}`} onClose={() => setCancelling(null)}>
          <label className="field">
            <span>Motivo</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Ej.: el cliente no llegó" autoFocus />
          </label>
          <div className="row-end">
            <button className="btn btn-ghost" onClick={() => setCancelling(null)}>
              Volver
            </button>
            <button className="btn btn-danger" onClick={cancel}>
              Cancelar pedido
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
