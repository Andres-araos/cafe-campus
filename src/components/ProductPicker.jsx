import { formatMoney } from '../lib/format.js'
import { groupByCategory } from '../lib/menu.js'

/**
 * Cuadrícula de productos con botones grandes para la hora pico.
 * showUnavailable: la caja ve los agotados deshabilitados; el cliente no los ve (RN-A2).
 */
export default function ProductPicker({ products, cart, onAdd, showUnavailable = false }) {
  const visible = showUnavailable ? products : products.filter((p) => p.available)
  const qty = Object.fromEntries(cart.map((l) => [l.product_id, l.quantity]))

  if (visible.length === 0) return <p className="empty">No hay productos en el menú.</p>

  return (
    <div className="picker">
      {groupByCategory(visible).map(([category, items]) => (
        <section key={category}>
          <h3 className="picker-category">{category}</h3>
          <div className="picker-grid">
            {items.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`product-btn${qty[p.id] ? ' selected' : ''}`}
                disabled={!p.available}
                onClick={() => onAdd(p)}
              >
                <span className="product-name">{p.name}</span>
                <span className="product-price">{p.available ? formatMoney(p.price) : 'Agotado'}</span>
                {qty[p.id] > 0 && <span className="product-qty">{qty[p.id]}</span>}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
