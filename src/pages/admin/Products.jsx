import { useState } from 'react'
import { Alert, Modal } from '../../components/ui.jsx'
import { useProducts } from '../../hooks/useProducts.js'
import { supabase, rpc, toAppError } from '../../lib/supabase.js'
import { formatMoney } from '../../lib/format.js'
import { CATEGORIES, groupByCategory } from '../../lib/menu.js'
import { downloadText, MENU_TEMPLATE, parseMenuCSV, parsePrice } from '../../lib/csv.js'

const EMPTY = { id: null, name: '', category: CATEGORIES[0], price: '', available: true }

/**
 * CAF-02: registrar y editar productos con precio, categoría y disponibilidad.
 * CAF-07: marcar productos como agotados.
 * CAF-12: cargar el menú desde una hoja de cálculo.
 */
export default function Products() {
  const { products, loading, error: loadError, reload } = useProducts()
  const [editing, setEditing] = useState(null)
  const [formErrors, setFormErrors] = useState({})
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(null)

  async function toggleAvailable(p) {
    setError(null)
    const { error: err } = await supabase.from('products').update({ available: !p.available }).eq('id', p.id)
    if (err) setError(toAppError(err).message)
    else {
      setNotice(`${p.name} ahora está ${p.available ? 'agotado' : 'disponible'}.`)
      reload()
    }
  }

  function validate(form) {
    const v = {}
    if (form.name.trim().length < 2 || form.name.trim().length > 60) v.name = 'El nombre debe tener entre 2 y 60 caracteres.'
    const price = parsePrice(form.price)
    if (price.error) v.price = `Precio inválido: ${price.error}.`
    const duplicate = products.find((p) => p.id !== form.id && p.name.trim().toLowerCase() === form.name.trim().toLowerCase())
    if (duplicate) v.name = 'Ya existe un producto con ese nombre.'
    setFormErrors(v)
    return Object.keys(v).length === 0 ? price.value : null
  }

  async function save(e) {
    e.preventDefault()
    const price = validate(editing)
    if (price == null) return
    setBusy(true)
    const payload = { name: editing.name.trim(), category: editing.category, price, available: editing.available }
    const { error: err } = editing.id
      ? await supabase.from('products').update(payload).eq('id', editing.id)
      : await supabase.from('products').insert(payload)
    setBusy(false)
    if (err) {
      setFormErrors({ form: err.code === '23505' ? 'Ya existe un producto con ese nombre.' : toAppError(err).message })
      return
    }
    setNotice(editing.id ? 'Producto actualizado.' : 'Producto creado.')
    setEditing(null)
    reload()
  }

  async function remove(p) {
    if (!window.confirm(`¿Eliminar "${p.name}" del menú? Si solo se acabó, mejor márcalo como agotado.`)) return
    const { error: err } = await supabase.from('products').delete().eq('id', p.id)
    if (err) setError(toAppError(err).message)
    else {
      setNotice('Producto eliminado. Los pedidos anteriores conservan su nombre y precio.')
      reload()
    }
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setImporting({ rows: [], errors: ['Guarda la hoja de cálculo como CSV (Archivo → Guardar como → CSV) y vuelve a intentar.'] })
      return
    }
    const text = await file.text()
    setImporting({ fileName: file.name, ...parseMenuCSV(text) })
  }

  async function confirmImport() {
    setBusy(true)
    try {
      const result = await rpc('import_products', { p_rows: importing.rows })
      setNotice(`Menú cargado: ${result.inserted} productos nuevos y ${result.updated} actualizados.`)
      setImporting(null)
      reload()
    } catch (err) {
      setImporting((s) => ({ ...s, errors: [err.message] }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="row-between wrap">
        <h1>Menú</h1>
        <div className="row-end">
          <label className="btn btn-ghost">
            Cargar desde hoja de cálculo
            <input type="file" accept=".csv,text/csv" onChange={onFile} hidden />
          </label>
          <button className="btn btn-primary" onClick={() => { setFormErrors({}); setEditing({ ...EMPTY }) }}>
            + Nuevo producto
          </button>
        </div>
      </div>

      <Alert>{loadError}</Alert>
      <Alert onClose={() => setError(null)}>{error}</Alert>
      <Alert kind="success" onClose={() => setNotice(null)}>{notice}</Alert>

      {loading ? (
        <p className="muted">Cargando…</p>
      ) : (
        groupByCategory(products).map(([category, items]) => (
          <section key={category} className="card">
            <h2>{category}</h2>
            <ul className="list">
              {items.map((p) => (
                <li key={p.id} className={`list-row product-row${p.available ? '' : ' unavailable'}`}>
                  <div>
                    <strong>{p.name}</strong>
                    <div className="muted">{formatMoney(p.price)}</div>
                  </div>
                  <div className="row-end">
                    <button
                      className={`btn btn-sm ${p.available ? 'btn-warning' : 'btn-success'}`}
                      onClick={() => toggleAvailable(p)}
                      aria-label={p.available ? `Marcar ${p.name} como agotado` : `Marcar ${p.name} como disponible`}
                    >
                      {p.available ? 'Marcar agotado' : 'Disponible otra vez'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setFormErrors({}); setEditing({ ...p, price: String(p.price) }) }}>
                      Editar
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => remove(p)} aria-label={`Eliminar ${p.name}`}>
                      Eliminar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {editing && (
        <Modal title={editing.id ? 'Editar producto' : 'Nuevo producto'} onClose={() => setEditing(null)}>
          <form onSubmit={save} noValidate>
            <Alert>{formErrors.form}</Alert>
            <label className="field">
              <span>Nombre</span>
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={60} autoFocus />
              {formErrors.name && <small className="field-error">{formErrors.name}</small>}
            </label>
            <label className="field">
              <span>Categoría</span>
              <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Precio en pesos (sin centavos)</span>
              <input inputMode="numeric" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} placeholder="3500" />
              {formErrors.price && <small className="field-error">{formErrors.price}</small>}
            </label>
            <label className="check">
              <input type="checkbox" checked={editing.available} onChange={(e) => setEditing({ ...editing, available: e.target.checked })} />
              <span>Disponible</span>
            </label>
            <div className="row-end">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {importing && (
        <Modal title="Cargar menú desde hoja de cálculo" onClose={() => setImporting(null)}>
          <p className="muted small">
            Columnas: Nombre, Categoría, Precio y Disponible (Sí/No). Los productos que ya existen se actualizan por nombre.{' '}
            <button className="link-btn" onClick={() => downloadText('plantilla-menu-cafe-campus.csv', MENU_TEMPLATE)}>
              Descargar plantilla
            </button>
          </p>
          {importing.errors.length > 0 && (
            <Alert>
              <strong>Corrige estas filas y vuelve a cargar el archivo:</strong>
              <ul>
                {importing.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Alert>
          )}
          {importing.rows.length > 0 && (
            <>
              <p>{importing.rows.length} productos listos para cargar:</p>
              <ul className="list compact">
                {importing.rows.map((r) => (
                  <li key={r.name} className="list-row">
                    <span>
                      {r.name} <span className="muted">· {r.category}</span>
                    </span>
                    <span>
                      {formatMoney(r.price)} {r.available ? '' : '· Agotado'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="row-end">
            <button className="btn btn-ghost" onClick={() => setImporting(null)}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={busy || importing.rows.length === 0 || importing.errors.length > 0} onClick={confirmImport}>
              {busy ? 'Cargando…' : 'Cargar menú'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
