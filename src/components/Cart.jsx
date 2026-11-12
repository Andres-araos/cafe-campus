import { formatMoney } from '../lib/format.js'
import { cartTotal } from '../lib/menu.js'

export default function Cart({ cart, onChange, onClear }) {
  if (cart.length === 0) {
    return <p className="empty">Toca un producto para agregarlo.</p>
  }

  return (
    <div className="cart">
      <ul className="cart-lines">
        {cart.map((line) => (
          <li key={line.product_id} className="cart-line">
            <div className="cart-line-name">
              {line.name}
              <span className="muted"> · {formatMoney(line.price)}</span>
            </div>
            <div className="qty">
              <button type="button" className="btn btn-sm" onClick={() => onChange(line, -1)} aria-label={`Quitar un ${line.name}`}>
                −
              </button>
              <span className="qty-value">{line.quantity}</span>
              <button type="button" className="btn btn-sm" onClick={() => onChange(line, 1)} aria-label={`Agregar un ${line.name}`}>
                +
              </button>
            </div>
            <div className="cart-line-subtotal">{formatMoney(line.price * line.quantity)}</div>
          </li>
        ))}
      </ul>
      <div className="cart-total">
        <span>Total</span>
        <strong>{formatMoney(cartTotal(cart))}</strong>
      </div>
      {onClear && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>
          Vaciar pedido
        </button>
      )}
    </div>
  )
}
