import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { CashProvider, useCash } from '../context/CashContext.jsx'
import { usePendingCount } from '../hooks/usePendingCount.js'
import { ROLE_LABEL } from '../lib/format.js'
import NewOrderAlerts from './NewOrderAlerts.jsx'
import NotificationCenter from './NotificationCenter.jsx'

const NAV = {
  cliente: [
    { to: '/menu', label: 'Pedir' },
    { to: '/mis-pedidos', label: 'Mis pedidos' },
  ],
  cajero: [
    { to: '/caja', label: 'Caja' },
    { to: '/barra', label: 'Barra', badge: true },
    { to: '/horario', label: 'Horario' },
  ],
  admin: [
    { to: '/caja', label: 'Caja' },
    { to: '/barra', label: 'Barra', badge: true },
    { to: '/horario', label: 'Horario' },
    { to: '/admin/productos', label: 'Menú' },
    { to: '/admin/cierre', label: 'Apertura y cierre' },
    { to: '/admin/reportes', label: 'Reportes' },
    { to: '/admin/usuarios', label: 'Usuarios' },
  ],
}

function CashPill() {
  const { isOpen, loading } = useCash()
  if (loading) return null
  return <span className={`cash-pill ${isOpen ? 'open' : 'closed'}`}>{isOpen ? 'Caja abierta' : 'Caja cerrada'}</span>
}

export default function Layout() {
  const { role } = useAuth()
  const isStaff = role === 'admin' || role === 'cajero'
  return (
    <CashProvider enabled={isStaff}>
      <Shell isStaff={isStaff} />
    </CashProvider>
  )
}

function Shell({ isStaff }) {
  const { profile, role, signOut } = useAuth()
  const pending = usePendingCount(isStaff)
  const links = NAV[role] || []

  // El número de pedidos por preparar también se ve en la pestaña del navegador
  useEffect(() => {
    document.title = isStaff && pending > 0 ? `(${pending}) Café Campus` : 'Café Campus'
  }, [isStaff, pending])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span aria-hidden="true">☕</span> Café Campus
        </div>
        <div className="user">
          <span className="user-name">{profile?.full_name}</span>
          {isStaff && <CashPill />}
          <span className="badge">{ROLE_LABEL[role]}</span>
          {role === 'cliente' && <NotificationCenter userId={profile?.id} />}
          <button className="btn btn-ghost btn-sm" onClick={signOut}>
            Salir
          </button>
        </div>
      </header>
      <nav className="tabs" aria-label="Secciones">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            {l.label}
            {l.badge && pending > 0 && (
              <span className="tab-badge" aria-label={`${pending} pedidos por preparar`}>
                {pending}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <main className="content">
        <Outlet />
      </main>
      {isStaff && <NewOrderAlerts />}
    </div>
  )
}
