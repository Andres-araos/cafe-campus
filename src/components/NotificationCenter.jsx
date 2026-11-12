import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../hooks/useNotifications.js'
import { formatTime } from '../lib/format.js'
import { chime } from '../lib/sound.js'

/**
 * Campana de mensajes del cliente y aviso grande cuando su pedido está listo.
 * El aviso aparece en cualquier pantalla de la app y queda guardado en la campana.
 */
export default function NotificationCenter({ userId }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [popup, setPopup] = useState(null)
  const panelRef = useRef(null)

  const { items, unread, markRead } = useNotifications(userId, {
    onNew: (n) => {
      setPopup(n)
      chime(n.kind === 'pedido_listo' ? [784, 988, 1319] : [440, 330])
      if (navigator.vibrate) navigator.vibrate([200, 100, 200])
    },
  })

  useEffect(() => {
    if (!open) return undefined
    const onClick = (e) => panelRef.current && !panelRef.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && unread > 0) markRead(items.filter((n) => !n.read_at).map((n) => n.id))
  }

  function seeOrder() {
    if (popup) markRead([popup.id])
    setPopup(null)
    navigate('/mis-pedidos')
  }

  return (
    <>
      <div className="bell-wrap" ref={panelRef}>
        <button className="bell" onClick={toggle} aria-label={`Mensajes${unread ? `, ${unread} sin leer` : ''}`} aria-expanded={open}>
          <span aria-hidden="true">🔔</span>
          {unread > 0 && <span className="bell-count">{unread}</span>}
        </button>
        {open && (
          <div className="bell-panel" role="dialog" aria-label="Mensajes">
            <h3>Mensajes</h3>
            {items.length === 0 ? (
              <p className="muted small">Aquí te avisamos cuando tu pedido esté listo.</p>
            ) : (
              <ul className="list">
                {items.map((n) => (
                  <li key={n.id} className={`msg msg-${n.kind}${n.read_at ? '' : ' unread'}`}>
                    <div className="row-between">
                      <strong>{n.title}</strong>
                      <span className="muted small">{formatTime(n.created_at)}</span>
                    </div>
                    <div className="small">{n.body}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {popup && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setPopup(null)}>
          <div className={`ready-popup ${popup.kind}`} role="alertdialog" aria-live="assertive" aria-label={popup.title}>
            <div className="ready-icon" aria-hidden="true">
              {popup.kind === 'pedido_listo' ? '☕' : '⚠️'}
            </div>
            <h2>{popup.title}</h2>
            <p>{popup.body}</p>
            <div className="row-end">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  markRead([popup.id])
                  setPopup(null)
                }}
              >
                Cerrar
              </button>
              <button className="btn btn-primary" onClick={seeOrder}>
                Ver mi pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
