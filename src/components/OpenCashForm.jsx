import { useState } from 'react'
import { Alert } from './ui.jsx'
import { rpc } from '../lib/supabase.js'
import { parsePrice } from '../lib/csv.js'
import { useCash } from '../context/CashContext.jsx'

/** La administradora abre la caja con la base en efectivo que deja en el cajón (RN-A4: pesos enteros). */
export default function OpenCashForm({ onOpened, compact = false }) {
  const { reload } = useCash()
  const [base, setBase] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError(null)
    let amount = 0
    if (base.trim() !== '') {
      const parsed = parsePrice(base)
      if (parsed.error && base.trim() !== '0') return setError(`Base inválida: ${parsed.error}.`)
      amount = parsed.value || 0
    }
    setBusy(true)
    try {
      await rpc('open_cash', { p_opening_cash: amount })
      await reload()
      onOpened?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className={compact ? 'open-cash compact' : 'open-cash'}>
      <label className="field">
        <span>Base en efectivo (opcional)</span>
        <input inputMode="numeric" value={base} onChange={(e) => setBase(e.target.value)} placeholder="Ej.: 50.000" />
      </label>
      <Alert onClose={() => setError(null)}>{error}</Alert>
      <button className="btn btn-success btn-lg btn-block" disabled={busy}>
        {busy ? 'Abriendo…' : 'Abrir caja'}
      </button>
    </form>
  )
}
