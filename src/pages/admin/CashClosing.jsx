import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Stat } from '../../components/ui.jsx'
import OpenCashForm from '../../components/OpenCashForm.jsx'
import { useCash } from '../../context/CashContext.jsx'
import { useNow } from '../../hooks/useNow.js'
import { rpc } from '../../lib/supabase.js'
import { formatDuration, formatMoney, formatTime } from '../../lib/format.js'

const GOAL_SECONDS = 5 * 60 // meta del indicador 4: menos de 5 minutos (línea base: 30 minutos)

/**
 * CAF-09: la administradora abre y cierra la caja cuantas veces quiera (RN-A5).
 * Cada cierre separa efectivo y transferencias, y el cronómetro mide el indicador
 * «Tiempo del cierre de caja».
 */
export default function CashClosing() {
  const { reload: reloadStatus } = useCash()
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [justClosed, setJustClosed] = useState(null)
  const startedAt = useRef(Date.now())
  const now = useNow(1000)

  const load = useCallback(async () => {
    try {
      setSummary(await rpc('cash_summary', {}))
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const session = summary?.session
  const elapsed = Math.round((now.getTime() - startedAt.current) / 1000)

  async function close() {
    if (summary.pending_orders > 0 &&
      !window.confirm(`Hay ${summary.pending_orders} pedidos sin entregar. Mientras la caja esté cerrada no se podrán preparar ni cobrar. ¿Cerrar de todos modos?`)) {
      return
    }
    setBusy(true)
    try {
      const seconds = Math.round((Date.now() - startedAt.current) / 1000)
      const closed = await rpc('close_cash', { p_duration_seconds: seconds })
      setJustClosed(closed)
      await Promise.all([load(), reloadStatus()])
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function onOpened() {
    setJustClosed(null)
    startedAt.current = Date.now()
    load()
  }

  return (
    <div className="narrow">
      <div className="row-between">
        <h1>Apertura y cierre de caja</h1>
        <button className="btn btn-ghost btn-sm" onClick={load}>
          Actualizar
        </button>
      </div>
      <Alert onClose={() => setError(null)}>{error}</Alert>

      {!summary ? (
        <p className="muted">Calculando…</p>
      ) : summary.is_open ? (
        <>
          <div className="cash-state open">
            Caja abierta desde las {formatTime(session.opened_at)}
            {session.opened_by ? ` por ${session.opened_by}` : ''}
          </div>

          <div className="stats">
            <Stat label="Ventas del turno" value={formatMoney(session.total)} hint={`${session.orders_count} pedidos cobrados`} />
            <Stat label="Efectivo" value={formatMoney(session.cash_total)} />
            <Stat label="Transferencias" value={formatMoney(session.transfer_total)} />
            <Stat
              label="Efectivo esperado en el cajón"
              value={formatMoney(session.opening_cash + session.cash_total)}
              hint={`Base ${formatMoney(session.opening_cash)} + ventas en efectivo`}
            />
          </div>

          {summary.pending_orders > 0 && (
            <Alert kind="warning">Hay {summary.pending_orders} pedidos de hoy sin entregar en la barra.</Alert>
          )}

          <div className={`card timer ${elapsed <= GOAL_SECONDS ? 'ok' : 'late'}`}>
            <div className="muted small">Tiempo del cierre</div>
            <div className="timer-value">{formatDuration(elapsed)}</div>
            <div className="muted small">Meta: menos de 5 minutos · Antes, con cuaderno y calculadora: 30 minutos</div>
          </div>

          <button className="btn btn-primary btn-lg btn-block" onClick={close} disabled={busy}>
            {busy ? 'Cerrando…' : `Cerrar caja por ${formatMoney(session.total)}`}
          </button>
        </>
      ) : (
        <>
          <div className="cash-state closed">La caja está cerrada. El personal no puede registrar, preparar ni cobrar pedidos.</div>
          {justClosed && (
            <Alert kind="success" onClose={() => setJustClosed(null)}>
              Caja cerrada en {formatDuration(justClosed.duration_seconds)} con {formatMoney(justClosed.total)}:{' '}
              {formatMoney(justClosed.cash_total)} en efectivo y {formatMoney(justClosed.transfer_total)} por transferencia.
            </Alert>
          )}
          <section className="card">
            <h2>Abrir caja</h2>
            <OpenCashForm onOpened={onOpened} />
          </section>
        </>
      )}

      {summary?.today?.length > 0 && (
        <section className="card">
          <h2>Cierres de hoy</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Turno</th>
                  <th className="num">Pedidos</th>
                  <th className="num">Efectivo</th>
                  <th className="num">Transferencias</th>
                  <th className="num">Total</th>
                  <th className="num">Tiempo del cierre</th>
                </tr>
              </thead>
              <tbody>
                {summary.today.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {formatTime(s.opened_at)} – {formatTime(s.closed_at)}
                    </td>
                    <td className="num">{s.orders_count}</td>
                    <td className="num">{formatMoney(s.cash_total)}</td>
                    <td className="num">{formatMoney(s.transfer_total)}</td>
                    <td className="num">{formatMoney(s.total)}</td>
                    <td className="num">{formatDuration(s.duration_seconds)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total del día</td>
                  <td className="num">{summary.today.reduce((a, s) => a + s.orders_count, 0)}</td>
                  <td className="num">{formatMoney(summary.today.reduce((a, s) => a + s.cash_total, 0))}</td>
                  <td className="num">{formatMoney(summary.today.reduce((a, s) => a + s.transfer_total, 0))}</td>
                  <td className="num">{formatMoney(summary.today.reduce((a, s) => a + s.total, 0))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
