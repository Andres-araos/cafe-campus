/** Categorías permitidas por la base de datos (tabla products). */
export const CATEGORIES = ['Bebidas calientes', 'Bebidas frías', 'Panadería', 'Almuerzos', 'Snacks']

export const MAX_QTY = 20

/** Agrupa productos por categoría respetando el orden de CATEGORIES. */
export function groupByCategory(products) {
  const groups = new Map(CATEGORIES.map((c) => [c, []]))
  for (const p of products) {
    if (!groups.has(p.category)) groups.set(p.category, [])
    groups.get(p.category).push(p)
  }
  return [...groups.entries()].filter(([, items]) => items.length > 0)
}

/** Total del carrito en pesos enteros (solo informativo: la base de datos recalcula el total). */
export function cartTotal(cart) {
  return cart.reduce((sum, line) => sum + line.price * line.quantity, 0)
}

export function cartCount(cart) {
  return cart.reduce((sum, line) => sum + line.quantity, 0)
}

/** Agrega o resta unidades de un producto. Devuelve un carrito nuevo. */
export function changeQuantity(cart, product, delta) {
  const existing = cart.find((l) => l.product_id === product.id)
  if (!existing) {
    if (delta <= 0) return cart
    return [...cart, { product_id: product.id, name: product.name, price: product.price, quantity: Math.min(delta, MAX_QTY) }]
  }
  const quantity = Math.min(MAX_QTY, existing.quantity + delta)
  if (quantity <= 0) return cart.filter((l) => l.product_id !== product.id)
  return cart.map((l) => (l.product_id === product.id ? { ...l, quantity } : l))
}

/** Quita del carrito los productos que se agotaron mientras el cliente elegía (RN-A2). */
export function removeUnavailable(cart, products) {
  const available = new Set(products.filter((p) => p.available).map((p) => p.id))
  return cart.filter((l) => available.has(l.product_id))
}

export function toOrderItems(cart) {
  return cart.map((l) => ({ product_id: l.product_id, quantity: l.quantity }))
}
