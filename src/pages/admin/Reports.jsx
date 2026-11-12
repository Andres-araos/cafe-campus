import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Empty, Stat } from '../../components/ui.jsx'
import { rpc } from '../../lib/supabase.js'
import { addDaysISO, formatDuration, formatMoney, todayISO } from '../../lib/format.js'
import { downloadText, toCSV } from '../../lib/csv.js'
import { pivotSales } from '../../lib/reports.js'

/** CAF-10: ventas por producto y franja horaria, e indicadores de impacto de la transformación. */
export default function Reports() {
  const today = todayISO()
  const [from, setFrom] = useState(addDaysISO(today, -6))
  const [to, setTo] = useState(today)
  const [rows, setRows] = useState([])
  const [indicators, setIndicators] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (from > to) {
      setError('La fecha inicial no puede ser posterior a la final.')
      return
    }
    setLoading(true)
    try {
      const [sales, ind] = await Promise.all([
        rpc('sales_report', { p_from: from, p_to: to }),
        rpc('impact_indicators', {}),
      ])
      setRows(sales)
      setIndicators(ind)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    load()
  }, [load])

  const pivot = useMemo(() => pivotSales(rows), [rows])
  const maxHour = Math.max(1, ...pivot.hourTotals.map((h) => h.quantity))

  function exportCSV() {
    const header = ['Producto', ...pivot.hours.map((h) => `${h}:00`), 'Total unidades', 'Total pesos']
    const body = pivot.products.map((p) => [p.name, ...pivot.hours.map((h) => p.byHour[h] || 0), p.quantity, p.revenue])
    downloadText(`ventas-por-franja-${from}-a-${to}.csv`, toCSV([header, ...body]))
  }

  return (
    <div>
      <h1>Reportes</h1>
      <Alert onClose={() => setError(null)}>{error}</Alert>

      {indicators && (
        <section>
          <h2>Indicadores de hoy</h2>
          <div className="stats">
            <Stat label="Pedidos" value={indicators.orders_total} hint={`${indicators.orders_advance} anticipados`} />
            <Stat label="Entregados" value={indicators.orders_delivered} />
            <Stat
              label="Pedidos sin rastro"
              value={indicators.orders_without_trace}
              hint="Meta 0 · antes se perdían 8 al día"
              tone={indicators.orders_without_trace === 0 ? 'good' : 'bad'}
            />
            <Stat label="Cancelados" value={indicators.orders_cancelled} />
            <Stat
              label="Minutos hasta listo (caja)"
              value={indicators.avg_minutes_to_ready ?? '—'}
              hint="Promedio desde el registro hasta «Listo»"
            />
            <Stat
              label="Último cierre de caja"
              value={formatDuration(indicators.last_closing_seconds)}
              hint="Meta: menos de 5 min · antes 30 min"
              tone={indicators.last_closing_seconds != null && indicators.last_closing_seconds <= 300 ? 'good' : undefined}
            />
          </div>
        </section>
      )}

      <section className="card">
        <div className="row-between wrap">
          <h2>Ventas por producto y franja horaria</h2>
          <div className="row-end wrap">
            <label className="field inline">
              <span>Desde</span>
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="field inline">
              <span>Hasta</span>
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </label>
            <button className="btn btn-ghost btn-sm" onClick={exportCSV} disabled={pivot.products.length === 0}>
              Exportar CSV
            </button>
          </div>
        </div>

        {loading ? (
          <p className="muted">Calculando…</p>
        ) : pivot.products.length === 0 ? (
          <Empty>No hay ventas entregadas en estas fechas.</Empty>
        ) : (
          <>
            <div className="bars" aria-label="Unidades vendidas por hora">
              {pivot.hourTotals.map((h) => (
                <div key={h.hour} className="bar-col">
                  <div className="bar-value">{h.quantity}</div>
                  <div className="bar" style={{ height: `${(h.quantity / maxHour) * 100}%` }} />
                  <div className="bar-label">{h.hour}:00</div>
                </div>
              ))}
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    {pivot.hours.map((h) => (
                      <th key={h} className="num">
                        {h}:00
                      </th>
                    ))}
                    <th className="num">Unidades</th>
                    <th className="num">Ventas</th>
                  </tr>
                </thead>
                <tbody>
                  {pivot.products.map((p) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      {pivot.hours.map((h) => (
                        <td key={h} className="num">
                          {p.byHour[h] || ''}
                        </td>
                      ))}
                      <td className="num">{p.quantity}</td>
                      <td className="num">{formatMoney(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    {pivot.hourTotals.map((h) => (
                      <td key={h.hour} className="num">
                        {h.quantity}
                      </td>
                    ))}
                    <td className="num">{pivot.totalQuantity}</td>
                    <td className="num">{formatMoney(pivot.totalRevenue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="muted small">
              La franja es la hora en que el cliente quiere el producto: la de recogida en los pedidos anticipados y la del
              registro en caja. Úsala para decidir cuánto preparar en cada hora.
            </p>
          </>
        )}
      </section>
    </div>
  )
}
