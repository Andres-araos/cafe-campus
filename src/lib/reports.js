/**
 * Convierte las filas de sales_report (producto, hora, cantidad, ingreso) en una tabla
 * producto × hora con totales (CAF-10).
 */
export function pivotSales(rows) {
  const hours = [...new Set(rows.map((r) => Number(r.hour_of_day)))].sort((a, b) => a - b)
  const map = new Map()

  for (const r of rows) {
    const key = r.product_name
    if (!map.has(key)) map.set(key, { name: key, byHour: {}, quantity: 0, revenue: 0 })
    const p = map.get(key)
    const q = Number(r.quantity)
    p.byHour[Number(r.hour_of_day)] = (p.byHour[Number(r.hour_of_day)] || 0) + q
    p.quantity += q
    p.revenue += Number(r.revenue)
  }

  const products = [...map.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, 'es'))
  const hourTotals = hours.map((hour) => ({
    hour,
    quantity: products.reduce((s, p) => s + (p.byHour[hour] || 0), 0),
  }))

  return {
    hours,
    products,
    hourTotals,
    totalQuantity: products.reduce((s, p) => s + p.quantity, 0),
    totalRevenue: products.reduce((s, p) => s + p.revenue, 0),
  }
}
