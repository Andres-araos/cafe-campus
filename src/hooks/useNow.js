import { useEffect, useState } from 'react'

/** Reloj que se actualiza cada `ms` milisegundos (edad de los pedidos, cronómetro del cierre). */
export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
