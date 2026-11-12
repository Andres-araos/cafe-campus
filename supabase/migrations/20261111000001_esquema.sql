-- Café Campus · Esquema base
-- Historias: CAF-01 (roles), CAF-02 (menú), CAF-03/04/05 (pedidos), CAF-08 (pagos), CAF-09 (cierre)
-- Reglas: RN-A1 (turno y estados), RN-A4 (pesos enteros), RN-A7 (consentimiento de datos)

-- ---------------------------------------------------------------------------
-- Perfiles y roles (CAF-01)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  full_name        text not null check (char_length(full_name) between 2 and 80),
  role             text not null default 'cliente'
                   check (role in ('admin', 'cajero', 'cliente')),
  data_consent_at  timestamptz,               -- RN-A7: fecha en que autorizó el tratamiento de datos
  created_at       timestamptz not null default now()
);

comment on table public.profiles is 'Usuarios de Café Campus con su rol (CAF-01).';

-- Rol del usuario actual. security definer para que las políticas RLS no se llamen a sí mismas.
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select role in ('admin', 'cajero') from public.profiles where id = auth.uid()), false);
$$;

-- Crea el perfil al registrarse. Todo registro nuevo es cliente: los roles de personal
-- solo los asigna la administradora (set_user_role).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, data_consent_at)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    case when (new.raw_user_meta_data ->> 'data_consent')::boolean then now() end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Menú (CAF-02, CAF-07, CAF-12)
-- ---------------------------------------------------------------------------
create table public.products (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(trim(name)) between 2 and 60),
  category    text not null check (category in ('Bebidas calientes', 'Bebidas frías', 'Panadería', 'Almuerzos', 'Snacks')),
  price       integer not null check (price > 0 and price <= 1000000),   -- RN-A4: pesos enteros
  available   boolean not null default true,                              -- RN-A2: agotado = false
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index products_name_unique on public.products (lower(trim(name)));

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Pedidos (CAF-03, CAF-04, CAF-05, CAF-06)
-- ---------------------------------------------------------------------------
create table public.daily_turns (
  day        date primary key,
  last_turn  integer not null default 0
);

create table public.orders (
  id              bigint generated always as identity primary key,
  order_day       date not null default (now() at time zone 'America/Bogota')::date,
  turn_number     integer not null,
  channel         text not null check (channel in ('caja', 'anticipado')),
  customer_id     uuid references public.profiles (id) on delete set null,
  customer_name   text not null check (char_length(trim(customer_name)) between 1 and 60),
  pickup_slot     timestamptz,                     -- RN-A3: solo pedidos anticipados
  status          text not null default 'recibido'
                  check (status in ('recibido', 'en_preparacion', 'listo', 'entregado', 'cancelado')),
  total           integer not null check (total > 0),
  notes           text check (char_length(notes) <= 200),
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  ready_at        timestamptz,
  delivered_at    timestamptz,
  cancel_reason   text,
  unique (order_day, turn_number),                 -- RN-A1: turno único en el día
  check ((channel = 'anticipado') = (pickup_slot is not null))
);

create index orders_day_status_idx on public.orders (order_day, status);
create index orders_slot_idx on public.orders (pickup_slot) where pickup_slot is not null;
create index orders_customer_idx on public.orders (customer_id);

create table public.order_items (
  id            bigint generated always as identity primary key,
  order_id      bigint not null references public.orders (id) on delete cascade,
  product_id    bigint references public.products (id) on delete set null,
  product_name  text not null,                     -- copia: el histórico no cambia si se edita el menú
  unit_price    integer not null check (unit_price > 0),
  quantity      integer not null check (quantity between 1 and 20),
  subtotal      integer generated always as (unit_price * quantity) stored
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

-- Historial de estados: trazabilidad y tiempos de ciclo del pedido (RN-A1)
create table public.order_status_history (
  id           bigint generated always as identity primary key,
  order_id     bigint not null references public.orders (id) on delete cascade,
  from_status  text,
  to_status    text not null,
  changed_by   uuid references public.profiles (id) on delete set null,
  changed_at   timestamptz not null default now()
);

create index order_status_history_order_idx on public.order_status_history (order_id);

-- ---------------------------------------------------------------------------
-- Pagos y cierre de caja (CAF-08, CAF-09)
-- ---------------------------------------------------------------------------
create table public.payments (
  id           bigint generated always as identity primary key,
  order_id     bigint not null unique references public.orders (id) on delete restrict,
  method       text not null check (method in ('efectivo', 'transferencia')),
  amount       integer not null check (amount > 0),
  pay_day      date not null default (now() at time zone 'America/Bogota')::date,
  received_by  uuid not null references public.profiles (id),
  paid_at      timestamptz not null default now()     -- RN-A6: fecha, hora y usuario
);

create index payments_day_idx on public.payments (pay_day);

create table public.cash_closings (
  id                bigint generated always as identity primary key,
  closing_day       date not null unique,
  orders_count      integer not null,
  cash_total        integer not null,
  transfer_total    integer not null,
  total             integer not null,
  duration_seconds  integer check (duration_seconds >= 0),   -- indicador: tiempo del cierre de caja
  closed_by         uuid not null references public.profiles (id),
  closed_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.products             enable row level security;
alter table public.daily_turns          enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.order_status_history enable row level security;
alter table public.payments             enable row level security;
alter table public.cash_closings        enable row level security;

-- Perfiles: cada quien ve el suyo; la administradora ve todos. Nadie edita su rol directamente.
create policy "perfil propio o admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.current_app_role()) = 'admin');

-- Menú: lo ve cualquier usuario autenticado; solo la administradora lo modifica (RN-A5)
create policy "menu visible" on public.products
  for select to authenticated using (true);
create policy "menu admin insert" on public.products
  for insert to authenticated with check ((select public.current_app_role()) = 'admin');
create policy "menu admin update" on public.products
  for update to authenticated
  using ((select public.current_app_role()) = 'admin')
  with check ((select public.current_app_role()) = 'admin');
create policy "menu admin delete" on public.products
  for delete to authenticated using ((select public.current_app_role()) = 'admin');

-- Pedidos: el personal ve todos; el cliente solo los suyos. Se escriben solo por RPC.
create policy "pedidos visibles" on public.orders
  for select to authenticated
  using ((select public.is_staff()) or customer_id = (select auth.uid()));

create policy "items visibles" on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_id
      and ((select public.is_staff()) or o.customer_id = (select auth.uid()))
  ));

create policy "historial visible al personal" on public.order_status_history
  for select to authenticated using ((select public.is_staff()));

create policy "pagos visibles al personal" on public.payments
  for select to authenticated using ((select public.is_staff()));

create policy "cierres visibles a admin" on public.cash_closings
  for select to authenticated using ((select public.current_app_role()) = 'admin');

-- daily_turns: sin políticas; solo lo usan las funciones security definer.

-- ---------------------------------------------------------------------------
-- Tiempo real: la barra y el cliente ven los cambios de estado al instante
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.products;
