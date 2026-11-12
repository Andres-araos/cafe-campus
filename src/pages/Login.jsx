import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { HOME_BY_ROLE } from '../components/ProtectedRoute.jsx'
import { Alert } from '../components/ui.jsx'

/** CAF-01: iniciar sesión con el rol asignado. */
export default function Login() {
  const { session, role, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (session && role) return <Navigate to={HOME_BY_ROLE[role]} replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Escribe un correo válido.')
    if (!password) return setError('Escribe tu contraseña.')
    setBusy(true)
    const message = await signIn(email, password)
    setBusy(false)
    if (message) setError(message)
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit} noValidate>
        <div className="auth-logo" aria-hidden="true">☕</div>
        <h1>Café Campus</h1>
        <p className="muted">Pide antes de salir de clase y recoge sin hacer fila.</p>

        <Alert onClose={() => setError(null)}>{error}</Alert>

        <label className="field">
          <span>Correo</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>

        <p className="auth-switch">
          ¿Primera vez? <Link to="/registro">Crea tu cuenta de cliente</Link>
        </p>
      </form>
    </div>
  )
}
