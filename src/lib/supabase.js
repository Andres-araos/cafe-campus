import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY. Copia .env.example como .env y llena los valores.',
  )
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
})

/** Llama una función RPC y lanza un Error con el mensaje en español de la base de datos. */
export async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) throw toAppError(error)
  return data
}

export function toAppError(error) {
  const err = new Error(error.message || 'Ocurrió un error inesperado.')
  err.code = error.hint || error.code || null
  err.details = error.details || null
  return err
}
