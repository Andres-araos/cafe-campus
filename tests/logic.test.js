import { describe, expect, it } from 'vitest'
import { cartTotal, changeQuantity, removeUnavailable, toOrderItems, MAX_QTY } from '../src/lib/menu.js'
import { addDaysISO, formatMoney, parseTimestamp, todayISO, formatTime } from '../src/lib/format.js'
import { groupByStatus, sortForBar } from '../src/lib/orders.js'
import { pivotSales } from '../src/lib/reports.js'

const tinto = { id: 1, name: 'Café tinto 7 oz', price: 2000, available: true }
const jugo = { id: 5, name: 'Jugo natural en agua', price: 5000, available: true }
const empanada = { id: 3, name: 'Empanada de carne', price: 3000, available: true }
const leche = { id: 2, name: 'Café con leche', price: 3500, available: true }

describe('carrito', () => {
  it('pedido de caja de la demostración: tinto + jugo = $7.000', () => {
    let cart = changeQuantity([], tinto, 1)
    cart = changeQuantity(cart, jugo, 1)
    expect(cartTotal(cart)).toBe(7000)
  })

  it('pedido de Laura: 2 empanadas + café con leche = $9.500', () => {
    let cart = changeQuantity([], empanada, 1)
    cart = changeQuantity(cart, empanada, 1)
    cart = changeQuantity(cart, leche, 1)
    expect(cartTotal(cart)).toBe(9500)
    expect(toOrderItems(cart)).toEqual([
      { product_id: 3, quantity: 2 },
      { product_id: 2, quantity: 1 },
    ])
  })

  it('quita la línea al llegar a cero y no pasa del máximo', () => {
    let cart = changeQuantity([], tinto, 1)
    cart = changeQuantity(cart, tinto, -1)
    expect(cart).toEqual([])
    cart = changeQuantity([], tinto, 50)
    expect(cart[0].quantity).toBe(MAX_QTY)
  })

  it('RN-A2: saca del carrito lo que se agotó', () => {
    const cart = changeQuantity(changeQuantity([], tinto, 1), jugo, 1)
    const products = [tinto, { ...jugo, available: false }]
    expect(removeUnavailable(cart, products).map((l) => l.product_id)).toEqual([1])
  })
})

describe('formato', () => {
  it('pesos sin decimales', () => {
    expect(formatMoney(16500).replace(/\s/g, ' ')).toMatch(/\$ ?16\.500$/)
  })

  it('lee el formato de fecha que devuelve Postgres', () => {
    expect(parseTimestamp('2026-11-12 15:15:00+00').toISOString()).toBe('2026-11-12T15:15:00.000Z')
    expect(parseTimestamp('2026-11-12T15:15:00+00:00').toISOString()).toBe('2026-11-12T15:15:00.000Z')
    expect(formatTime('2026-11-12 15:15:00+00')).toMatch(/10:15/)
  })

  it('fecha de hoy en Bogotá aunque en UTC ya sea mañana', () => {
    expect(todayISO(new Date('2026-11-12T03:00:00Z'))).toBe('2026-11-11')
    expect(addDaysISO('2026-11-30', 1)).toBe('2026-12-01')
  })
})

describe('tablero de la barra', () => {
  const orders = [
    { id: 1, turn_number: 3, status: 'recibido', created_at: '2026-11-19T15:05:00Z', pickup_slot: null },
    { id: 2, turn_number: 1, status: 'recibido', created_at: '2026-11-19T13:00:00Z', pickup_slot: '2026-11-19T15:30:00Z' },
    { id: 3, turn_number: 2, status: 'listo', created_at: '2026-11-19T14:00:00Z', pickup_slot: null },
    { id: 4, turn_number: 4, status: 'entregado', created_at: '2026-11-19T14:00:00Z', pickup_slot: null },
  ]

  it('ordena por hora de recogida, no por hora de registro', () => {
    expect(sortForBar(orders.slice(0, 2)).map((o) => o.id)).toEqual([1, 2])
  })

  it('agrupa por columnas y deja fuera los entregados', () => {
    const g = groupByStatus(orders)
    expect(g.recibido.map((o) => o.id)).toEqual([1, 2])
    expect(g.listo.map((o) => o.id)).toEqual([3])
    expect(g.en_preparacion).toEqual([])
    expect(g.entregado).toBeUndefined()
  })
})

describe('reporte de ventas por franja (CAF-10)', () => {
  it('arma la tabla producto × hora con totales', () => {
    const p = pivotSales([
      { product_name: 'Empanada de carne', hour_of_day: 10, quantity: 2, revenue: 6000 },
      { product_name: 'Café tinto 7 oz', hour_of_day: 10, quantity: 1, revenue: 2000 },
      { product_name: 'Café tinto 7 oz', hour_of_day: 12, quantity: 3, revenue: 6000 },
    ])
    expect(p.hours).toEqual([10, 12])
    expect(p.products[0]).toMatchObject({ name: 'Café tinto 7 oz', quantity: 4, revenue: 8000 })
    expect(p.hourTotals).toEqual([
      { hour: 10, quantity: 3 },
      { hour: 12, quantity: 3 },
    ])
    expect(p.totalRevenue).toBe(14000)
  })
})
