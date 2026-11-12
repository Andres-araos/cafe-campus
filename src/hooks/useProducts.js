import { useCallback, useEffect, useState } from 'react'
import { supabase, toAppError } from '../lib/supabase.js'

/** Menú en tiempo real: si la administradora marca algo agotado, desaparece al instante (RN-A2). */
export function useProducts({ onlyAvailable = false } = {}) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    let query = supabase.from('products').select('*').order('category').order('name')
    if (onlyAvailable) query = query.eq('available', true)
    const { data, error: err } = await query
    if (err) setError(toAppError(err).message)
    else {
      setProducts(data)
      setError(null)
    }
    setLoading(false)
  }, [onlyAvailable])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`products-${onlyAvailable ? 'available' : 'all'}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load, onlyAvailable])

  return { products, loading, error, reload: load }
}
