import { useCallback, useEffect, useState } from 'react'
import { supabase, rpc } from '../lib/supabase.js'

/**
 * Mensajes del cliente dentro de la app (CAF-06). La base de datos los crea cuando la barra
 * marca el pedido como listo o lo cancela; aquí llegan en tiempo real.
 */
export function useNotifications(userId, { onNew } = {}) {
  const [items, setItems] = useState([])

  const load = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    setItems(data || [])
  }, [userId])

  useEffect(() => {
    if (!userId) return undefined
    load()
    const channel = supabase
      .channel(`notifications-${userId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        ({ new: n }) => {
          setItems((list) => [n, ...list.filter((x) => x.id !== n.id)].slice(0, 20))
          onNew?.(n)
        },
      )
      .subscribe()
    const poll = setInterval(load, 30000)
    return () => {
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
    // onNew cambia en cada render; la suscripción solo depende del usuario
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, load])

  const markRead = useCallback(async (ids = null) => {
    setItems((list) => list.map((n) => (ids === null || ids.includes(n.id) ? { ...n, read_at: n.read_at || new Date().toISOString() } : n)))
    try {
      await rpc('mark_notifications_read', { p_ids: ids })
    } catch {
      load()
    }
  }, [load])

  return { items, unread: items.filter((n) => !n.read_at).length, markRead }
}
