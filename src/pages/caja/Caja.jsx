import { useEffect, useState } from 'react'
import ProductPicker from '../../components/ProductPicker.jsx'
import Cart from '../../components/Cart.jsx'
import { Alert } from '../../components/ui.jsx'
import AppOrdersPanel from '../../components/AppOrdersPanel.jsx'
import CashClosedBanner from '../../components/CashClosedBanner.jsx'
import { useCash } from '../../context/CashContext.jsx'
import { useProducts } from '../../hooks/useProducts.js'
import { rpc } from '../../lib/supabase.js'
import { formatMoney } from '../../lib/format.js'
import { cartTotal, changeQuantity, removeUnavailable, toOrderItems } from '../../lib/menu.js'

/** CAF-03: el cajero registra un pedido con varios productos y obtiene su número de turno. */
export default function Caja() {
  const { products, loading, error: productsError } = useProducts()
  const { isOpen: cashOpen } = useCash()
  const [cart, setCart] = useState([])
  const [customer, setCustomer] = useState('')
  const [error, setError] = useState(null)
  const [last, setLast] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setCart((c) => removeUnavailable(c, products))
  }, [products])

  async function submit() {
    setError(null)
    if (cart.length === 0) return setError('Agrega al menos un producto.')
    setBusy(true)
    try {
      const order = await rpc('create_order', {
        p_items: toOrderItems(cart),
        p_customer_name: customer.trim() || null,
      })
      setLast({ ...order, customer: customer.trim() || 'Cliente en caja' })
      setCart([])
      setCustomer('')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="split">
      <section>
        <h1>Caja</h1>
        <CashClosedBanner />
        <Alert>{productsError}</Alert>
        {loading ? (
          <p className="muted">Cargando menú…</p>
        ) : (
          <ProductPicker
            products={products}
            cart={cart}
            showUnavailable
            onAdd={(p) => {
              setLast(null)
              setCart((c) => changeQuantity(c, p, 1))
            }}
          />
        )}
      </section>

      <aside className="sticky">
        <div className="card">
        {last && (
          <div className="turn-ticket" role="status">
            <div className="muted">Turno para {last.customer}</div>
            <div className="turn-big">{last.turn_number}</div>
            <div>{formatMoney(last.total)} · se paga al entregar</div>
          </div>
        )}

        <h2>Pedido en caja</h2>
        <Cart
          cart={cart}
          onChange={(line, d) => setCart((c) => changeQuantity(c, { id: line.product_id, ...line }, d))}
          onClear={() => setCart([])}
        />

        <label className="field">
          <span>Nombre del cliente (opcional)</span>
          <input value={customer} onChange={(e) => setCustomer(e.target.value)} maxLength={60} placeholder="Para llamarlo en la barra" />
        </label>

        <Alert onClose={() => setError(null)}>{error}</Alert>

        <button className="btn btn-primary btn-lg btn-block" onClick={submit} disabled={busy || cart.length === 0 || !cashOpen}>
          {busy ? 'Registrando…' : `Registrar pedido${cart.length ? ' · ' + formatMoney(cartTotal(cart)) : ''}`}
        </button>
        </div>
        <AppOrdersPanel />
      </aside>
    </div>
  )
}
