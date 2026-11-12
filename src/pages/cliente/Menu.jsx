import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ProductPicker from '../../components/ProductPicker.jsx'
import Cart from '../../components/Cart.jsx'
import { Alert } from '../../components/ui.jsx'
import { useProducts } from '../../hooks/useProducts.js'
import { rpc } from '../../lib/supabase.js'
import { addDaysISO, formatMoney, formatTime, parseTimestamp, todayISO } from '../../lib/format.js'
import { cartCount, cartTotal, changeQuantity, removeUnavailable, toOrderItems } from '../../lib/menu.js'

const MIN_ADVANCE_MS = 15 * 60 * 1000

/** CAF-05: pedido anticipado desde el celular eligiendo la hora de recogida (RN-A3). */
export default function Menu() {
  const navigate = useNavigate()
  const { products, loading, error: productsError } = useProducts({ onlyAvailable: true })
  const [cart, setCart] = useState([])
  const [day, setDay] = useState(() => todayISO())
  const [slots, setSlots] = useState([])
  const [slot, setSlot] = useState(null)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(null)
  const [offer, setOffer] = useState(null)
  const [busy, setBusy] = useState(false)

  const today = todayISO()
  const tomorrow = addDaysISO(today, 1)

  // Si un producto se agota mientras el cliente elige, sale del carrito (RN-A2)
  useEffect(() => {
    setCart((c) => removeUnavailable(c, products))
  }, [products])

  const loadSlots = useCallback(async () => {
    try {
      const data = await rpc('slot_availability', { p_day: day })
      setSlots(data)
    } catch (e) {
      setError(e.message)
    }
  }, [day])

  useEffect(() => {
    loadSlots()
    const id = setInterval(loadSlots, 30000)
    return () => clearInterval(id)
  }, [loadSlots])

  const visibleSlots = useMemo(() => {
    const limit = Date.now() + MIN_ADVANCE_MS
    // Las franjas que el personal cerró no se muestran al cliente
    return slots.filter((s) => !s.is_blocked && parseTimestamp(s.slot).getTime() >= limit)
  }, [slots])

  function nextFreeAfter(slotValue) {
    const t = parseTimestamp(slotValue).getTime()
    return visibleSlots.find((s) => parseTimestamp(s.slot).getTime() > t && s.taken < s.capacity)
  }

  function pickSlot(s) {
    setError(null)
    if (s.taken >= s.capacity) {
      const next = nextFreeAfter(s.slot)
      setSlot(null)
      setOffer({
        message: `La franja de las ${formatTime(s.slot)} ya tiene ${s.capacity} pedidos, el máximo que puede preparar la barra.`,
        slot: next?.slot ?? null,
      })
      return
    }
    setOffer(null)
    setSlot(s.slot)
  }

  async function submit() {
    setError(null)
    setOffer(null)
    if (cart.length === 0) return setError('Agrega al menos un producto.')
    if (!slot) return setError('Elige la hora en que vas a recoger tu pedido.')

    setBusy(true)
    try {
      const order = await rpc('create_order', {
        p_items: toOrderItems(cart),
        p_pickup_slot: parseTimestamp(slot).toISOString(),
        p_notes: notes || null,
      })
      navigate('/mis-pedidos', { state: { created: order } })
    } catch (e) {
      if (['FRANJA_LLENA', 'FRANJA_CERRADA', 'ANTICIPACION'].includes(e.code)) {
        setSlot(null)
        setOffer({ message: e.message, slot: e.details || null })
        loadSlots()
      } else {
        setError(e.message)
        if (e.code === 'FUERA_DE_HORARIO') {
          setSlot(null)
          loadSlots()
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="split">
      <section>
        <h1>¿Qué vas a pedir?</h1>
        <Alert>{productsError}</Alert>
        {loading ? (
          <p className="muted">Cargando menú…</p>
        ) : (
          <ProductPicker products={products} cart={cart} onAdd={(p) => setCart((c) => changeQuantity(c, p, 1))} />
        )}
      </section>

      <aside className="card sticky">
        <h2>Tu pedido</h2>
        <Cart
          cart={cart}
          onChange={(line, d) => setCart((c) => changeQuantity(c, { id: line.product_id, ...line }, d))}
          onClear={() => setCart([])}
        />

        <h3>¿Cuándo lo recoges?</h3>
        <div className="segmented" role="group" aria-label="Día de recogida">
          {[
            [today, 'Hoy'],
            [tomorrow, 'Mañana'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={day === value ? 'active' : ''}
              onClick={() => {
                setDay(value)
                setSlot(null)
                setOffer(null)
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {visibleSlots.length === 0 ? (
          <p className="muted">
            {slots.length === 0
              ? 'La cafetería no recibe pedidos este día.'
              : 'No quedan franjas disponibles para este día.'}{' '}
            {day === today && 'Prueba con mañana.'}
          </p>
        ) : (
          <div className="slots">
            {visibleSlots.map((s) => {
              const full = s.taken >= s.capacity
              return (
                <button
                  key={s.slot}
                  type="button"
                  className={`slot${slot === s.slot ? ' selected' : ''}${full ? ' full' : ''}`}
                  onClick={() => pickSlot(s)}
                  aria-pressed={slot === s.slot}
                >
                  {formatTime(s.slot)}
                  <small>{full ? 'Llena' : `${s.capacity - s.taken} cupo${s.capacity - s.taken === 1 ? '' : 's'}`}</small>
                </button>
              )
            })}
          </div>
        )}

        {offer && (
          <Alert kind="warning" onClose={() => setOffer(null)}>
            {offer.message}
            {offer.slot ? (
              <div className="alert-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    // El detalle del error llega con otro formato de fecha: se busca la misma franja en la lista
                    const t = parseTimestamp(offer.slot).getTime()
                    const match = visibleSlots.find((s) => parseTimestamp(s.slot).getTime() === t)
                    setSlot(match ? match.slot : offer.slot)
                    setOffer(null)
                  }}
                >
                  Pedir para las {formatTime(offer.slot)}
                </button>
              </div>
            ) : (
              <div>No quedan franjas libres hoy. Prueba con mañana.</div>
            )}
          </Alert>
        )}

        <label className="field">
          <span>Nota para la barra (opcional)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} placeholder="Ej.: sin azúcar" />
        </label>

        <Alert onClose={() => setError(null)}>{error}</Alert>

        <button className="btn btn-primary btn-lg btn-block" onClick={submit} disabled={busy}>
          {busy
            ? 'Enviando…'
            : cart.length
              ? `Pedir ${cartCount(cart)} producto${cartCount(cart) > 1 ? 's' : ''} · ${formatMoney(cartTotal(cart))}`
              : 'Pedir'}
        </button>
        <p className="muted small">Pagas al recoger, en efectivo o por transferencia.</p>
      </aside>
    </div>
  )
}
