# Mapa de historias → código

Sirve para la trazabilidad (sección 14 de la guía): de cada historia a los archivos que la implementan, y de cada archivo a su historia. El responsable sigue el reparto del plan de Sprints.

| Historia | Responsable | Rama | Archivos principales | Base de datos | Reglas |
|---|---|---|---|---|---|
| CAF-01 · Iniciar sesión con rol | Dev 1 (pareja Dev 2) | `feature/CAF-01-login-roles` | `src/context/AuthContext.jsx`, `src/components/ProtectedRoute.jsx`, `src/components/Layout.jsx`, `src/pages/Login.jsx`, `src/pages/Register.jsx`, `src/pages/Privacy.jsx`, `src/pages/admin/Users.jsx` | `profiles`, `handle_new_user`, `current_app_role`, `is_staff`, `set_user_role` | RN-A5, RN-A7 |
| CAF-02 · Menú con precio, categoría y disponibilidad | Dev 2 | `feature/CAF-02-menu` | `src/pages/admin/Products.jsx`, `src/hooks/useProducts.js`, `src/lib/menu.js` | `products` y sus políticas RLS | RN-A4, RN-A5 |
| CAF-T06 · Datos de prueba | PO | `chore/CAF-T06-seed` | `supabase/seed.sql` | — | RN-A4 |
| CAF-03 · Pedido en caja con turno | Dev 1 | `feature/CAF-03-registrar-pedido` | `src/pages/caja/Caja.jsx`, `src/components/ProductPicker.jsx`, `src/components/Cart.jsx` | `create_order`, `daily_turns`, `orders`, `order_items` | RN-A1, RN-A4 |
| CAF-04 · Tablero de la barra | Dev 2 | `feature/CAF-04-tablero-barra` | `src/pages/caja/Barra.jsx`, `src/hooks/useOrders.js`, `src/lib/orders.js`, `src/components/NewOrderAlerts.jsx`, `src/components/AppOrdersPanel.jsx`, `src/hooks/usePendingCount.js` | `move_order`, `cancel_order`, `order_status_history`, Realtime | RN-A1 |
| CAF-05 · Pedido anticipado | SM (pareja Dev 1) | `feature/CAF-05-pedido-anticipado` | `src/pages/cliente/Menu.jsx`, `src/pages/caja/Horario.jsx` | `create_order` (rama anticipado), `slot_availability`, `next_available_slot`, `service_hours`, `slot_blocks`, `set_service_hours`, `set_slot_blocked` | RN-A3, RN-A7 |
| CAF-07 · Productos agotados | PO | `feature/CAF-07-agotados` | `toggleAvailable` en `src/pages/admin/Products.jsx`, `removeUnavailable` en `src/lib/menu.js` | validación `AGOTADO` en `create_order` | RN-A2 |
| CAF-06 · Estado del pedido y aviso de pedido listo | Dev 2 | `feature/CAF-06-estado-pedido` | `src/pages/cliente/MyOrders.jsx`, `src/components/NotificationCenter.jsx`, `src/hooks/useNotifications.js`, `src/lib/sound.js` | política «pedidos visibles», `notifications`, trigger `notify_order_status`, `mark_notifications_read` | RN-A1 |
| CAF-08 · Pago al entregar | Dev 1 | `feature/CAF-08-pago` | modal «Entregar y cobrar» en `src/pages/caja/Barra.jsx` | `deliver_order`, `payments` | RN-A4, RN-A6 |
| CAF-09 · Cierre de caja | Dev 1 (pareja Dev 2) | `feature/CAF-09-cierre-caja` | `src/pages/admin/CashClosing.jsx`, `src/context/CashContext.jsx`, `src/components/OpenCashForm.jsx`, `src/components/CashClosedBanner.jsx`, `src/hooks/useNow.js` | `cash_sessions`, `open_cash`, `cash_status`, `cash_summary`, `close_cash`, `require_open_cash` | RN-A4, RN-A5 |
| CAF-10 · Ventas por franja | SM | `feature/CAF-10-ventas-franja` | `src/pages/admin/Reports.jsx`, `src/lib/reports.js` | `sales_report`, `impact_indicators` | RN-A4 |
| CAF-12 · Carga del menú desde hoja de cálculo | PO | `feature/CAF-12-carga-menu` | `src/lib/csv.js`, importación en `src/pages/admin/Products.jsx` | `import_products` | RN-A4 |
| CAF-15 · Funcionalidad diferenciadora | Dev 2 (pareja SM) | `feature/CAF-15-diferenciadora` | _por construir: la que eligió el Delphi_ | — | — |

Archivos comunes (base del proyecto, CAF-T01): `package.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`, `src/styles.css`, `src/lib/supabase.js`, `src/lib/format.js`, `src/components/ui.jsx`.

## Pruebas automatizadas

| Archivo | Cubre |
|---|---|
| `tests/csv.test.js` | CAF-12 y RN-A4: lectura de CSV, precios enteros, filas inválidas |
| `tests/logic.test.js` | CAF-03/05 (totales de la demostración), RN-A2, CAF-04 (orden de la barra), CAF-10 (tabla por franja), fechas en Bogotá |

## Convención de commits

```
feat(pedidos): registrar pedido con número de turno. Refs CAF-03
fix(barra): no permitir mover pedidos entregados. Refs CAF-04
test(menu): precios con centavos se rechazan. Refs CAF-12
```

En una sesión en pareja, el commit termina con una línea en blanco y `Co-authored-by: Nombre <correo-de-github>`.
