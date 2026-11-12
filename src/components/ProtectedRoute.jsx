import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export const HOME_BY_ROLE = {
  admin: '/admin/productos',
  cajero: '/caja',
  cliente: '/menu',
}

/** CAF-01: cada rol entra solo a las pantallas que le corresponden. */
export default function ProtectedRoute({ roles }) {
  const { session, role, loading } = useAuth()
  const location = useLocation()

  if (loading) return <div className="center-screen">Cargando…</div>
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />
  if (!role) {
    return (
      <div className="center-screen">
        No encontramos tu perfil. Cierra sesión y vuelve a entrar, o avisa a la administradora.
      </div>
    )
  }
  if (roles && !roles.includes(role)) return <Navigate to={HOME_BY_ROLE[role]} replace />
  return <Outlet />
}
