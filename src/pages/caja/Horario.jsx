import { useCallback, useEffect, useState } from 'react'
import { Alert } from '../../components/ui.jsx'
import { supabase, rpc, toAppError } from '../../lib/supabase.js'
import { addDaysISO, formatTime, parseTimestamp, todayISO } from '../../lib/format.js'

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const ORDER = [1, 2, 3, 4, 5, 6, 0]

/** Horas de 00:00 a 23:45 en pasos de 15 minutos para los selectores. */
const TIMES = Array.from({ length: 96 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, '0')
  const m = String((i % 4) * 15).padStart(2, '0')
  return `${h}:${m}`
})

function label(time) {
  const [h, m] = time.split(':').map(Number)
  const suffix = h < 12 ? 'a. m.' : 'p. m.'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

/**
 * CAF-05: el personal decide en qué horas puede recoger pedidos el cliente.
 * Horario semanal + cierre manual de franjas de hoy y mañana.
 */
export default function Horario() {
  const [hours, setHours] = useState([])
  const [day, setDay] = useState(() => todayISO())
  const [slots, setSlots] = useState([])
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [savingDay, setSavingDay] = useState(null)
  const [busySlot, setBusySlot] = useState(null)

  const loadHours = useCallback(async () => {
    const { data, error: err } = await supabase.from('service_hours').select('*')
    if (err) setError(toAppError(err).message)
    else setHours(data.map((h) => ({ ...h, open_time: h.open_time.slice(0, 5), close_time: h.close_time.slice(0, 5) })))
  }, [])

  const loadSlots = useCallback(async () => {
    try {
      setSlots(await rpc('slot_availability', { p_day: day }))
    } catch (e) {
      setError(e.message)
    }
  }, [day])

  useEffect(() => {
    loadHours()
  }, [loadHours])

  useEffect(() => {
    loadSlots()
    const channel = supabase
      .channel(`horario-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadSlots)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slot_blocks' }, loadSlots)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadSlots])

  const edit = (weekday, patch) => setHours((list) => list.map((h) => (h.weekday === weekday ? { ...h, ...patch, dirty: true } : h)))

  async function saveDay(h) {
    setError(null)
    if (h.open_time > h.close_time) return setError(`${DAYS[h.weekday]}: la apertura debe ser antes del cierre.`)
    setSavingDay(h.weekday)
    try {
      await rpc('set_service_hours', { p_weekday: h.weekday, p_is_open: h.is_open, p_open: h.open_time, p_close: h.close_time })
      setNotice(`Horario del ${DAYS[h.weekday].toLowerCase()} guardado.`)
      await loadHours()
      await loadSlots()
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingDay(null)
    }
  }

  async function toggleSlot(s) {
    setError(null)
    setBusySlot(s.slot)
    try {
      await rpc('set_slot_blocked', { p_slot: parseTimestamp(s.slot).toISOString(), p_blocked: !s.is_blocked })
      await loadSlots()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusySlot(null)
    }
  }

  const now = Date.now()
  const byDay = Object.fromEntries(hours.map((h) => [h.weekday, h]))

  return (
    <div className="narrow">
      <h1>Horario de pedidos</h1>
      <p className="muted small">
        Aquí decides a qué horas pueden recoger los clientes que piden por la app. Cada franja dura 15 minutos y admite
        hasta 10 pedidos.
      </p>
      <Alert onClose={() => setError(null)}>{error}</Alert>
      <Alert kind="success" onClose={() => setNotice(null)}>{notice}</Alert>

      <section className="card">
        <h2>Franjas de {day === todayISO() ? 'hoy' : 'mañana'}</h2>
        <div className="segmented" role="group" aria-label="Día">
          {[
            [todayISO(), 'Hoy'],
            [addDaysISO(todayISO(), 1), 'Mañana'],
          ].map(([value, text]) => (
            <button key={value} type="button" className={day === value ? 'active' : ''} onClick={() => setDay(value)}>
              {text}
            </button>
          ))}
        </div>
        <p className="muted small">Toca una franja para cerrarla o abrirla. Los pedidos que ya tenga se mantienen.</p>
        {slots.length === 0 ? (
          <p className="empty">La cafetería no abre este día. Cámbialo en el horario semanal.</p>
        ) : (
          <div className="slots slots-admin">
            {slots.map((s) => {
              const past = parseTimestamp(s.slot).getTime() < now
              return (
                <button
                  key={s.slot}
                  type="button"
                  className={`slot${s.is_blocked ? ' blocked' : ''}${s.taken >= s.capacity ? ' full' : ''}`}
                  disabled={past || busySlot === s.slot}
                  onClick={() => toggleSlot(s)}
                  aria-pressed={!s.is_blocked}
                  title={s.is_blocked ? 'Cerrada: toca para abrir' : 'Abierta: toca para cerrar'}
                >
                  {formatTime(s.slot)}
                  <small>{past ? 'Pasó' : s.is_blocked ? 'Cerrada' : `${s.taken}/${s.capacity} pedidos`}</small>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Horario semanal</h2>
        <ul className="list">
          {ORDER.filter((d) => byDay[d]).map((d) => {
            const h = byDay[d]
            return (
              <li key={d} className="hours-row">
                <label className="check hours-day">
                  <input type="checkbox" checked={h.is_open} onChange={(e) => edit(d, { is_open: e.target.checked })} />
                  <strong>{DAYS[d]}</strong>
                </label>
                {h.is_open ? (
                  <div className="hours-times">
                    <select value={h.open_time} onChange={(e) => edit(d, { open_time: e.target.value })} aria-label={`Primera franja del ${DAYS[d]}`}>
                      {TIMES.map((t) => (
                        <option key={t} value={t}>
                          {label(t)}
                        </option>
                      ))}
                    </select>
                    <span className="muted">a</span>
                    <select value={h.close_time} onChange={(e) => edit(d, { close_time: e.target.value })} aria-label={`Última franja del ${DAYS[d]}`}>
                      {TIMES.map((t) => (
                        <option key={t} value={t}>
                          {label(t)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="muted">Cerrado</span>
                )}
                <button className="btn btn-primary btn-sm" disabled={!h.dirty || savingDay === d} onClick={() => saveDay(h)}>
                  {savingDay === d ? 'Guardando…' : 'Guardar'}
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
