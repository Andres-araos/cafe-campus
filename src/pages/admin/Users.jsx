import { useCallback, useEffect, useState } from 'react'
import { Alert } from '../../components/ui.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase, rpc, toAppError } from '../../lib/supabase.js'
import { addDaysISO, formatDate, formatTime, ROLE_LABEL, todayISO } from '../../lib/format.js'

/** CAF-01: la administradora asigna los roles. Incluye las herramientas para preparar la demostración. */
export default function Users() {
  const { profile: me } = useAuth()
  const [users, setUsers] = useState([])
  const [filter, setFilter] = useState('')
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [demoDay, setDemoDay] = useState(() => todayISO())
  const [demoTime, setDemoTime] = useState('10:00')

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from('profiles').select('*').order('role').order('full_name')
    if (err) setError(toAppError(err).message)
    else setUsers(data)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function changeRole(user, role) {
    setError(null)
    try {
      await rpc('set_user_role', { p_user_id: user.id, p_role: role })
      setNotice(`${user.full_name} ahora es ${ROLE_LABEL[role].toLowerCase()}.`)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function prepareDemo() {
    setError(null)
    // La hora se interpreta en Bogotá (UTC-5, sin horario de verano)
    const slot = new Date(`${demoDay}T${demoTime}:00-05:00`)
    if (Number.isNaN(slot.getTime()) || slot.getMinutes() % 15 !== 0) {
      return setError('Elige una hora en franjas de 15 minutos (por ejemplo, 10:00 o 10:15).')
    }
    try {
      const created = await rpc('prepare_demo_slot', { p_slot: slot.toISOString() })
      setNotice(
        created > 0
          ? `Listo: la franja de las ${formatTime(slot)} del ${formatDate(slot)} quedó con 10 pedidos de prueba.`
          : 'Esa franja ya estaba llena.',
      )
    } catch (e) {
      setError(e.message)
    }
  }

  async function clearDemo() {
    if (!window.confirm('¿Borrar los pedidos de prueba que no se han cobrado?')) return
    try {
      const n = await rpc('clear_demo_orders', {})
      setNotice(`Se borraron ${n} pedidos de prueba.`)
    } catch (e) {
      setError(e.message)
    }
  }

  const q = filter.trim().toLowerCase()
  const visible = users.filter((u) => !q || u.full_name.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))

  return (
    <div className="narrow">
      <h1>Usuarios y roles</h1>
      <Alert onClose={() => setError(null)}>{error}</Alert>
      <Alert kind="success" onClose={() => setNotice(null)}>{notice}</Alert>

      <p className="muted small">
        Quien se registra en la app entra como cliente. Aquí asignas el rol de cajero o administradora al personal.
      </p>
      <label className="field">
        <span>Buscar</span>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Nombre o correo" />
      </label>

      <ul className="list card">
        {visible.map((u) => (
          <li key={u.id} className="list-row">
            <div>
              <strong>{u.full_name}</strong>
              <div className="muted small">{u.email}</div>
            </div>
            <select
              value={u.role}
              disabled={u.id === me?.id}
              onChange={(e) => changeRole(u, e.target.value)}
              aria-label={`Rol de ${u.full_name}`}
            >
              {Object.entries(ROLE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>

      <section className="card">
        <h2>Preparar la demostración</h2>
        <p className="muted small">
          Llena una franja con 10 pedidos de prueba para mostrar que la app no deja pedir en una franja llena (RN-A3).
        </p>
        <div className="row-end wrap">
          <select value={demoDay} onChange={(e) => setDemoDay(e.target.value)} aria-label="Día">
            <option value={todayISO()}>Hoy</option>
            <option value={addDaysISO(todayISO(), 1)}>Mañana</option>
          </select>
          <input type="time" step={900} value={demoTime} onChange={(e) => setDemoTime(e.target.value)} aria-label="Hora" />
          <button className="btn btn-primary" onClick={prepareDemo}>
            Llenar franja
          </button>
          <button className="btn btn-ghost" onClick={clearDemo}>
            Borrar pedidos de prueba
          </button>
        </div>
      </section>
    </div>
  )
}
