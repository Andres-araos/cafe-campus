# ☕ Café Campus

Transformación digital de una cafetería universitaria: pedidos anticipados desde el celular, tablero de pedidos para la barra, cierre de caja automático y ventas por franja horaria.

Proyecto final (Momento Evaluativo 3) de **Metodología de Software Colaborativo** · Universidad Cooperativa de Colombia · II/2026 · Caso A.

## Equipo

| Rol | Integrante | GitHub |
|---|---|---|
| Product Owner | _(nombre)_ | _(usuario)_ |
| Scrum Master | _(nombre)_ | _(usuario)_ |
| Developer | _(nombre)_ | _(usuario)_ |
| Developer | _(nombre)_ | _(usuario)_ |

## Qué hace

| Rol | Puede |
|---|---|
| **Cliente** | Registrarse con autorización de datos, pedir con anticipación eligiendo franja de 15 min, ver el estado de su pedido en tiempo real y recibir un mensaje en la app cuando está listo. |
| **Cajero y barra** | Registrar pedidos en caja con número de turno, recibir avisos de pedidos nuevos de la app, mover pedidos por el tablero (recibido → en preparación → listo), entregar registrando el pago y definir el horario y las franjas en que los clientes pueden recoger. |
| **Administradora** | Todo lo anterior, más abrir y cerrar la caja cuantas veces quiera, gestionar el menú (precios, agotados, carga desde CSV), hacer el cierre de caja, ver reportes e indicadores y asignar roles. |

Las reglas de negocio RN-A1 a RN-A7 se validan **en la base de datos** (funciones de Postgres y RLS), no solo en la pantalla. Ver `docs/ARQUITECTURA.md`.

## Tecnología

- **Frontend:** React 18 + Vite 5 + React Router 6, CSS propio (sin framework de UI), diseño adaptable a celular.
- **Backend:** Supabase: PostgreSQL 17, autenticación, Row Level Security, funciones RPC y Realtime.
- **Pruebas:** Vitest para la lógica del cliente; casos de prueba manuales en el libro de control.

## Instalación

Requisitos: Node 18 o superior y un proyecto de Supabase.

```bash
git clone https://github.com/<organizacion>/cafe-campus.git
cd cafe-campus
npm install
cp .env.example .env      # y llena VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev               # abre http://localhost:5173
```

### Base de datos (solo la primera vez, en un proyecto nuevo)

En Supabase → **SQL Editor**, ejecuta en orden:

1. `supabase/migrations/20261111000001_esquema.sql`
2. `supabase/migrations/20261111000002_reglas_de_negocio.sql`
3. `supabase/migrations/20261112000003_horario_y_mensajes.sql`
4. `supabase/migrations/20261112000004_turnos_de_caja.sql`
5. `supabase/seed.sql` (menú y usuarios de prueba)

En **Authentication → Sign In / Providers → Email**, desactiva *Confirm email* para la demostración. Si lo dejas activo, los clientes nuevos deben confirmar su correo antes de entrar.

### Usuarios de prueba

Contraseña de todos: `CafeCampus2026!`

| Correo | Rol |
|---|---|
| patricia@cafecampus.test | Administradora |
| esteban@cafecampus.test | Cajero y barra |
| rosa@cafecampus.test | Cajero y barra |
| laura@cafecampus.test | Cliente |
| diego@cafecampus.test | Cliente |

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compila para producción en `dist/` |
| `npm run preview` | Sirve la compilación |
| `npm test` | Pruebas unitarias (Vitest) |

## Demostración final (sección 4.10 de la guía)

0. **Patricia** abre la caja en **Apertura y cierre** (sin caja abierta, el personal no puede operar).
1. **Usuarios → Preparar la demostración:** llena la franja que usará Diego (10 pedidos de prueba).
2. **Patricia** marca el pandebono como agotado en **Menú**.
3. **Laura** pide 2 empanadas y 1 café con leche ($9.500) para una franja posterior. El pandebono no aparece.
4. **Diego** intenta la franja llena: la app lo impide y le ofrece la siguiente franja libre (RN-A3).
5. **Esteban** registra en **Caja** un tinto y un jugo ($7.000). Ambos pedidos aparecen en la **Barra**.
6. La barra los pasa a *Listo*. Laura lo ve en *Mis pedidos*, recoge y paga por transferencia. El de caja se paga en efectivo.
7. **Patricia** entra a **Apertura y cierre** (el cronómetro arranca solo) y cierra la caja: $16.500, de los cuales $7.000 en efectivo y $9.500 por transferencia.
8. Al final: **Usuarios → Borrar pedidos de prueba**.

Como la sustentación es a la 1:00 p. m., usen franjas de la tarde: la app exige 15 minutos de anticipación.

## Enlaces del proyecto

- Tablero Scrumban: _(enlace)_
- Canal del equipo: _(enlace)_
- Carpeta compartida y libro de control: _(enlace)_
- App desplegada: _(enlace, si aplica)_

## Uso de inteligencia artificial

_(Obligatorio según la guía, sección 17.9. Complétenlo con lo que de verdad usaron.)_ Ejemplo: «Usamos Claude (Anthropic) como apoyo para generar una primera versión del esquema de base de datos y de las pantallas. Cada integrante revisó, adaptó y probó las historias a su cargo, y puede explicar su código».

## Licencia

Proyecto académico. Uso educativo.
