import { CATEGORIES } from './menu.js'

/** Lee CSV con coma o punto y coma (Excel en español usa ";"), con comillas dobles. */
export function parseCSV(text) {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0] || ''
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ','

  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (inQuotes) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const normalize = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()

const HEADER_ALIASES = {
  name: ['nombre', 'producto', 'name'],
  category: ['categoria', 'category'],
  price: ['precio', 'valor', 'price'],
  available: ['disponible', 'disponibilidad', 'available', 'estado'],
}

/** RN-A4: el precio debe ser un entero en pesos. Acepta "3500", "3.500" y "$ 3.500". */
export function parsePrice(raw) {
  const s = String(raw ?? '').replace(/\s|\$|COP/gi, '')
  if (s === '') return { error: 'precio vacío' }
  if (/[,.]\d{1,2}$/.test(s)) return { error: 'el precio no puede tener centavos' }
  if (!/^\d{1,3}([.,]\d{3})*$|^\d+$/.test(s)) return { error: `precio "${raw}" no es un número` }
  const value = Number(s.replace(/[.,]/g, ''))
  if (!Number.isInteger(value) || value <= 0) return { error: 'el precio debe ser mayor que 0' }
  if (value > 1000000) return { error: 'el precio es demasiado alto' }
  return { value }
}

export function parseAvailable(raw) {
  const s = normalize(raw)
  if (s === '' || ['si', 'sí', 'true', '1', 'disponible', 'x'].includes(s)) return { value: true }
  if (['no', 'false', '0', 'agotado'].includes(s)) return { value: false }
  return { error: `disponibilidad "${raw}" no reconocida (usa Sí o No)` }
}

function matchCategory(raw) {
  const s = normalize(raw)
  return CATEGORIES.find((c) => normalize(c) === s) || null
}

/**
 * Convierte el CSV del menú en filas listas para import_products (CAF-12).
 * Devuelve { rows, errors } donde errors es una lista de mensajes por fila.
 */
export function parseMenuCSV(text) {
  const table = parseCSV(text)
  if (table.length < 2) return { rows: [], errors: ['El archivo debe tener encabezados y al menos una fila.'] }

  const headers = table[0].map(normalize)
  const index = {}
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    index[key] = headers.findIndex((h) => aliases.includes(h))
  }
  const missing = ['name', 'category', 'price'].filter((k) => index[k] === -1)
  if (missing.length) {
    return { rows: [], errors: ['Faltan columnas obligatorias: Nombre, Categoría y Precio.'] }
  }

  const rows = []
  const errors = []
  const seen = new Set()

  table.slice(1).forEach((cells, i) => {
    const line = i + 2
    const name = String(cells[index.name] ?? '').trim()
    const category = matchCategory(cells[index.category])
    const price = parsePrice(cells[index.price])
    const available = index.available === -1 ? { value: true } : parseAvailable(cells[index.available])

    const problems = []
    if (name.length < 2 || name.length > 60) problems.push('el nombre debe tener entre 2 y 60 caracteres')
    if (!category) problems.push(`categoría "${cells[index.category] ?? ''}" no válida (usa: ${CATEGORIES.join(', ')})`)
    if (price.error) problems.push(price.error)
    if (available.error) problems.push(available.error)
    if (seen.has(normalize(name))) problems.push('producto repetido en el archivo')

    if (problems.length) {
      errors.push(`Fila ${line} (${name || 'sin nombre'}): ${problems.join('; ')}.`)
    } else {
      seen.add(normalize(name))
      rows.push({ name, category, price: price.value, available: available.value })
    }
  })

  return { rows, errors }
}

export const MENU_TEMPLATE = [
  'Nombre;Categoría;Precio;Disponible',
  'Café tinto 7 oz;Bebidas calientes;2000;Sí',
  'Café con leche;Bebidas calientes;3500;Sí',
  'Empanada de carne;Panadería;3000;Sí',
  'Pandebono;Panadería;2500;No',
  'Jugo natural en agua;Bebidas frías;5000;Sí',
  'Almuerzo del día;Almuerzos;14000;Sí',
].join('\r\n')

/** Genera un CSV con punto y coma para que Excel en español lo abra en columnas. */
export function toCSV(rows) {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c ?? '')
          return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(';'),
    )
    .join('\r\n')
}

export function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
