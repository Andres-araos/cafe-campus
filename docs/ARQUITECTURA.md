# Arquitectura de Café Campus

## Vista general

```
Celular / tableta / PC (React + Vite)
        │  supabase-js (HTTPS + WebSocket)
        ▼
Supabase
  ├─ Auth ─────────────── sesiones y contraseñas cifradas (bcrypt)
  ├─ PostgREST ────────── lecturas con RLS y llamadas RPC
  ├─ Realtime ─────────── cambios de pedidos y menú al instante
  └─ PostgreSQL 17
       ├─ tablas + RLS ── quién ve qué
       └─ funciones ──── reglas de negocio RN-A1 … RN-A7
```

**Decisión principal:** toda escritura de pedidos, pagos y cierres pasa por funciones de Postgres (`create_order`, `move_order`, `deliver_order`, `close_cash`…). La app no puede insertar en esas tablas directamente: los permisos están revocados. Así, una regla como «máximo 10 pedidos por franja» se cumple aunque alguien llame a la API sin usar la app, y se puede mostrar en la sustentación que la profesora no logra violarla.

Las funciones son `SECURITY DEFINER` con `search_path` vacío, y cada una comprueba el rol de quien llama al empezar. El asesor de seguridad de Supabase las marca como advertencia porque un usuario autenticado puede ejecutarlas: es intencional, y la verificación de rol dentro de cada función es lo que protege los datos.

## Modelo de datos

| Tabla | Para qué | Notas |
|---|---|---|
| `profiles` | Usuario, rol y fecha de autorización de datos | Se crea sola al registrarse (trigger). Todos entran como cliente. |
| `products` | Menú | Precio `integer` (RN-A4). Nombre único sin importar mayúsculas. |
| `orders` | Pedidos | `unique (order_day, turn_number)` (RN-A1). `pickup_slot` obligatorio solo si es anticipado. |
| `order_items` | Productos de cada pedido | Copia nombre y precio: el histórico no cambia si se edita el menú. |
| `order_status_history` | Cada cambio de estado con fecha y usuario | Trazabilidad y tiempos de ciclo del pedido. |
| `payments` | Un pago por pedido entregado | Método, monto, fecha, hora y usuario (RN-A6). |
| `cash_sessions` | Turnos de caja: apertura con base en efectivo y cierre con totales | Solo puede haber uno abierto. Guarda la duración del cierre (indicador 4). |
| `service_hours`, `slot_blocks` | Horario semanal y franjas cerradas a mano por el personal | Definen qué franjas ve el cliente. |
| `notifications` | Mensajes al cliente (pedido listo o cancelado) | Los crea un trigger al cambiar el estado del pedido. |
| `daily_turns` | Contador de turnos por día | Solo lo usan las funciones; evita turnos repetidos con dos cajas a la vez. |

## Reglas de negocio

| Regla | Dónde se cumple |
|---|---|
| RN-A1 Turno único y estados en orden | `daily_turns` + `unique (order_day, turn_number)`; transiciones permitidas en `move_order` y `deliver_order` |
| RN-A2 Agotado no se puede pedir | `create_order` (hint `AGOTADO`); el menú del cliente lo oculta y el carrito lo quita en tiempo real |
| RN-A3 Franjas de 15 min, 15 min de anticipación, máx. 10 por franja | `create_order` con `pg_advisory_xact_lock` por franja: dos clientes no pueden tomar el último cupo a la vez. Si está llena, devuelve la siguiente franja libre en `details` |
| RN-A4 Pesos enteros | Columnas `integer`; el total lo calcula la base de datos con los precios vigentes |
| RN-A5 Solo la administradora cambia precios, abre y cierra la caja | Políticas RLS de `products`; verificación de rol en `open_cash` y `close_cash`. Con la caja cerrada, `create_order` (caja), `move_order`, `deliver_order` y `cancel_order` del personal se rechazan (`CAJA_CERRADA`) |
| RN-A6 Pago al entregar con fecha, hora y usuario | `deliver_order` crea el pago y entrega en la misma transacción |
| RN-A7 Datos personales con autorización | Casilla obligatoria en el registro; `data_consent_at` en `profiles`; aviso en `/privacidad`; el cliente solo ve sus pedidos |

## Concurrencia

- **Turnos:** `insert … on conflict (day) do update set last_turn = last_turn + 1 returning last_turn` es atómico: dos cajeros nunca reciben el mismo turno.
- **Cupo de franja:** el bloqueo de asesoría por franja serializa solo a quienes piden la misma franja; las demás siguen en paralelo.
- **Mover y entregar:** `select … for update` sobre el pedido evita que dos personas de la barra lo cambien al tiempo.

## Seguridad

- La clave publicable de Supabase va en `.env` y es segura en el navegador; `.env` está en `.gitignore`.
- El rol anónimo no tiene acceso a ninguna tabla.
- Nadie puede cambiar su propio rol: solo `set_user_role`, que exige ser administradora y no deja que ella se quite el rol a sí misma.
- Recomendado en Supabase: activar *Leaked password protection* en Authentication.

## Pantallas

| Ruta | Rol | Historia |
|---|---|---|
| `/login`, `/registro`, `/privacidad` | Todos | CAF-01, RN-A7 |
| `/menu` | Cliente | CAF-05 |
| `/mis-pedidos` | Cliente | CAF-06 |
| `/caja` | Cajero, admin | CAF-03 |
| `/barra` | Cajero, admin | CAF-04, CAF-08 |
| `/admin/productos` | Admin | CAF-02, CAF-07, CAF-12 |
| `/horario` | Cajero, admin | CAF-05 |
| `/admin/cierre` | Admin | CAF-09 |
| `/admin/reportes` | Admin | CAF-10, indicadores |
| `/admin/usuarios` | Admin | CAF-01 y preparación de la demo |
