import { parseTimestamp } from './format.js'

/** Estados del tablero de la barra (RN-A1). */
export const BOARD_COLUMNS = [
  { status: 'recibido', title: 'Recibido' },
  { status: 'en_preparacion', title: 'En preparación' },
  { status: 'listo', title: 'Listo' },
]

/** Transiciones que ofrece la barra; la base de datos valida las mismas. */
export const NEXT_STATUS = { recibido: 'en_preparacion', en_preparacion: 'listo' }
export const PREV_STATUS = { en_preparacion: 'recibido', listo: 'en_preparacion' }

/**
 * La barra prepara por hora de recogida: los anticipados por su franja y los de caja
 * por la hora en que se registraron.
 */
export function prepKey(order) {
  const d = parseTimestamp(order.pickup_slot || order.created_at)
  return d ? d.getTime() : 0
}

export function sortForBar(orders) {
  return [...orders].sort((a, b) => prepKey(a) - prepKey(b) || a.turn_number - b.turn_number)
}

export function groupByStatus(orders) {
  const groups = Object.fromEntries(BOARD_COLUMNS.map((c) => [c.status, []]))
  for (const o of sortForBar(orders)) {
    if (groups[o.status]) groups[o.status].push(o)
  }
  return groups
}

export function itemsSummary(order) {
  return (order.order_items || []).map((i) => `${i.quantity} × ${i.product_name}`).join(', ')
}

export const PROGRESS = ['recibido', 'en_preparacion', 'listo', 'entregado']

export function progressIndex(status) {
  return PROGRESS.indexOf(status)
}
