import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useCash } from '../context/CashContext.jsx'
import { formatTime } from '../lib/format.js'
import OpenCashForm from './OpenCashForm.jsx'
import { Modal } from './ui.jsx'

/** Aviso en la caja y la barra cuando la caja está cerrada. La administradora la puede abrir desde aquí. */
export default function CashClosedBanner() {
  const { role } = useAuth()
  const { status, isOpen, loading } = useCash()
  const [opening, setOpening] = useState(false)

  if (loading || isOpen) return null

  return (
    <div className="cash-closed" role="status">
      <div>
        <strong>La caja está cerrada.</strong>{' '}
        {role === 'admin'
          ? 'Ábrela para que el personal pueda registrar, preparar y cobrar pedidos.'
          : 'No se pueden registrar, preparar ni cobrar pedidos hasta que la administradora la abra.'}
        {status?.closed_at && (
          <div className="small">
            Cerrada a las {formatTime(status.closed_at)}
            {status.closed_by ? ` por ${status.closed_by}` : ''}.
          </div>
        )}
      </div>
      {role === 'admin' && (
        <button className="btn btn-success" onClick={() => setOpening(true)}>
          Abrir caja
        </button>
      )}
      {opening && (
        <Modal title="Abrir caja" onClose={() => setOpening(false)}>
          <OpenCashForm compact onOpened={() => setOpening(false)} />
        </Modal>
      )}
    </div>
  )
}
