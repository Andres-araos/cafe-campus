import { Link } from 'react-router-dom'

/** Aviso de privacidad (RN-A7). Texto de ejemplo para el proyecto académico; no es asesoría legal. */
export default function Privacy() {
  return (
    <div className="auth-page">
      <article className="card prose">
        <h1>Aviso de tratamiento de datos personales</h1>
        <p>
          Café Campus trata tus datos conforme a la Ley 1581 de 2012 y sus decretos reglamentarios.
        </p>
        <h2>Qué datos guardamos</h2>
        <ul>
          <li>Tu nombre y correo, para identificar tus pedidos.</li>
          <li>Tus pedidos: productos, hora de recogida, estado y forma de pago.</li>
        </ul>
        <h2>Para qué los usamos</h2>
        <ul>
          <li>Preparar y entregar tus pedidos y mostrarte su estado.</li>
          <li>Calcular ventas por producto y franja horaria para decidir cuánto preparar. Estos reportes no muestran datos personales.</li>
        </ul>
        <h2>Quién los ve</h2>
        <p>
          Solo el personal de la cafetería ve tu nombre en el pedido. La administradora ve los reportes. No vendemos ni
          compartimos tus datos con terceros.
        </p>
        <h2>Tus derechos</h2>
        <p>
          Puedes conocer, actualizar, rectificar y pedir que eliminemos tus datos, o revocar esta autorización, escribiendo
          a la administración de la cafetería.
        </p>
        <p className="muted">
          Texto de ejemplo elaborado para un proyecto académico de la Universidad Cooperativa de Colombia.
        </p>
        <Link to="/registro" className="btn btn-primary">
          Volver
        </Link>
      </article>
    </div>
  )
}
