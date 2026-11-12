import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import Layout from './components/Layout.jsx'
import ProtectedRoute, { HOME_BY_ROLE } from './components/ProtectedRoute.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Privacy from './pages/Privacy.jsx'
import Menu from './pages/cliente/Menu.jsx'
import MyOrders from './pages/cliente/MyOrders.jsx'
import Caja from './pages/caja/Caja.jsx'
import Barra from './pages/caja/Barra.jsx'
import Horario from './pages/caja/Horario.jsx'
import Products from './pages/admin/Products.jsx'
import CashClosing from './pages/admin/CashClosing.jsx'
import Reports from './pages/admin/Reports.jsx'
import Users from './pages/admin/Users.jsx'

function Home() {
  const { session, role, loading } = useAuth()
  if (loading) return <div className="center-screen">Cargando…</div>
  if (!session) return <Navigate to="/login" replace />
  return <Navigate to={HOME_BY_ROLE[role] || '/login'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/registro" element={<Register />} />
      <Route path="/privacidad" element={<Privacy />} />

      <Route element={<ProtectedRoute roles={['cliente']} />}>
        <Route element={<Layout />}>
          <Route path="/menu" element={<Menu />} />
          <Route path="/mis-pedidos" element={<MyOrders />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['cajero', 'admin']} />}>
        <Route element={<Layout />}>
          <Route path="/caja" element={<Caja />} />
          <Route path="/barra" element={<Barra />} />
          <Route path="/horario" element={<Horario />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['admin']} />}>
        <Route element={<Layout />}>
          <Route path="/admin/productos" element={<Products />} />
          <Route path="/admin/cierre" element={<CashClosing />} />
          <Route path="/admin/reportes" element={<Reports />} />
          <Route path="/admin/usuarios" element={<Users />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
