import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { Alert } from '../components/ui.jsx'

/** Registro de clientes con autorización de tratamiento de datos (RN-A7, Ley 1581 de 2012). */
export default function Register() {
  const { session, signUp } = useAuth()
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '', dataConsent: false })
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  function validate() {
    const v = {}
    if (form.fullName.trim().length < 2) v.fullName = 'Escribe tu nombre (mínimo 2 letras).'
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) v.email = 'Escribe un correo válido.'
    if (form.password.length < 8) v.password = 'La contraseña debe tener al menos 8 caracteres.'
    if (form.password !== form.confirm) v.confirm = 'Las contraseñas no coinciden.'
    if (!form.dataConsent) v.dataConsent = 'Necesitamos tu autorización para guardar tu nombre y tus pedidos.'
    setErrors(v)
    return Object.keys(v).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setServerError(null)
    if (!validate()) return
    setBusy(true)
    const result = await signUp(form)
    setBusy(false)
    if (result.error) setServerError(result.error)
    else if (result.needsConfirmation) setDone(true)
  }

  if (done) {
    return (
      <div className="auth-page">
        <div className="card auth-card">
          <h1>Revisa tu correo</h1>
          <p>Te enviamos un enlace para confirmar tu cuenta. Después podrás entrar y pedir.</p>
          <Link className="btn btn-primary btn-block" to="/login">
            Ir a iniciar sesión
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit} noValidate>
        <h1>Crea tu cuenta</h1>
        <p className="muted">Para pedir con anticipación y ver cuándo está listo tu pedido.</p>

        <Alert onClose={() => setServerError(null)}>{serverError}</Alert>

        <label className="field">
          <span>Nombre</span>
          <input autoComplete="name" value={form.fullName} onChange={set('fullName')} maxLength={80} />
          {errors.fullName && <small className="field-error">{errors.fullName}</small>}
        </label>
        <label className="field">
          <span>Correo</span>
          <input type="email" autoComplete="email" value={form.email} onChange={set('email')} />
          {errors.email && <small className="field-error">{errors.email}</small>}
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />
          {errors.password && <small className="field-error">{errors.password}</small>}
        </label>
        <label className="field">
          <span>Repite la contraseña</span>
          <input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
          {errors.confirm && <small className="field-error">{errors.confirm}</small>}
        </label>

        <label className="check">
          <input type="checkbox" checked={form.dataConsent} onChange={set('dataConsent')} />
          <span>
            Autorizo a Café Campus a tratar mi nombre, correo e historial de pedidos según la{' '}
            <Link to="/privacidad" target="_blank">
              política de tratamiento de datos
            </Link>{' '}
            (Ley 1581 de 2012).
          </span>
        </label>
        {errors.dataConsent && <small className="field-error">{errors.dataConsent}</small>}

        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
        <p className="auth-switch">
          ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
        </p>
      </form>
    </div>
  )
}
