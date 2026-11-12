export const TIME_ZONE = 'America/Bogota'

const money = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

/** RN-A4: los valores en pesos son enteros. */
export function formatMoney(value) {
  return money.format(Math.round(Number(value) || 0))
}

const timeFmt = new Intl.DateTimeFormat('es-CO', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' })
const dateFmt = new Intl.DateTimeFormat('es-CO', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' })
const isoDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

/**
 * Convierte los timestamps de Postgres ("2026-11-12 15:15:00+00") a Date.
 * Safari no acepta el espacio ni el desfase sin minutos.
 */
export function parseTimestamp(value) {
  if (!value) return null
  if (value instanceof Date) return value
  let s = String(value).trim().replace(' ', 'T')
  s = s.replace(/([+-]\d{2})$/, '$1:00')
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatTime(value) {
  const d = parseTimestamp(value)
  return d ? timeFmt.format(d) : ''
}

export function formatDate(value) {
  const d = parseTimestamp(value)
  return d ? dateFmt.format(d) : ''
}

/** Fecha de hoy en Bogotá como "AAAA-MM-DD", sin importar la zona del dispositivo. */
export function todayISO(base = new Date()) {
  return isoDateFmt.format(base)
}

export function addDaysISO(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

export function minutesSince(value, now = new Date()) {
  const d = parseTimestamp(value)
  if (!d) return 0
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 60000))
}

export function formatDuration(seconds) {
  if (seconds == null) return '—'
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  const rest = s % 60
  return m > 0 ? `${m} min ${String(rest).padStart(2, '0')} s` : `${rest} s`
}

export const STATUS_LABEL = {
  recibido: 'Recibido',
  en_preparacion: 'En preparación',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

export const ROLE_LABEL = {
  admin: 'Administradora',
  cajero: 'Cajero y barra',
  cliente: 'Cliente',
}
