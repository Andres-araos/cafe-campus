-- Café Campus · Horario configurable por el personal y mensajes al cliente dentro de la app
-- Historias: CAF-05 (franjas que define el personal), CAF-06 (aviso de pedido listo)

-- ---------------------------------------------------------------------------
-- Horario de atención por día de la semana (0 = domingo … 6 = sábado)
-- open_time es la primera franja y close_time la última franja de recogida.
-- ---------------------------------------------------------------------------
create table public.service_hours (
  weekday     smallint primary key check (weekday between 0 and 6),
  is_open     boolean not null default true,
  open_time   time not null default '06:00',
  close_time  time not null default '19:45',
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  check (open_time <= close_time),
  check (extract(minute from open_time)::integer % 15 = 0 and extract(second from open_time) = 0),
  check (extract(minute from close_time)::integer % 15 = 0 and extract(second from close_time) = 0)
);

insert into public.service_hours (weekday, is_open, open_time, close_time) values
  (0, false, '08:00', '12:45'),
  (1, true,  '06:00', '19:45'),
  (2, true,  '06:00', '19:45'),
  (3, true,  '06:00', '19:45'),
  (4, true,  '06:00', '19:45'),
  (5, true,  '06:00', '19:45'),
  (6, true,  '07:00', '13:45');

-- Franjas cerradas a mano (por ejemplo, la barra está desbordada o hay un evento)
create table public.slot_blocks (
  slot        timestamptz primary key,
  blocked_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.service_hours enable row level security;
alter table public.slot_blocks enable row level security;

create policy "horario visible" on public.service_hours for select to authenticated using (true);
create policy "bloqueos visibles" on public.slot_blocks for select to authenticated using (true);

-- Los pedidos de relleno de la demostración se marcan aparte, sin escribir nada visible en la nota
alter table public.orders add column is_demo boolean not null default false;
update public.orders set is_demo = true, notes = null where notes = 'DEMO';

-- ---------------------------------------------------------------------------
-- Disponibilidad de franjas según el horario y los bloqueos
-- ---------------------------------------------------------------------------
drop function public.next_available_slot(timestamptz);
drop function public.slot_availability(date);

create function public.slot_availability(p_day date default null)
returns table (slot timestamptz, taken integer, capacity integer, is_blocked boolean, is_available boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with d as (select coalesce(p_day, public.today_bogota()) as day),
  h as (
    select sh.* from public.service_hours sh, d
    where sh.weekday = extract(dow from d.day)::smallint and sh.is_open
  ),
  slots as (
    select generate_series(
      ((select day from d) + (select open_time from h)) at time zone 'America/Bogota',
      ((select day from d) + (select close_time from h)) at time zone 'America/Bogota',
      interval '15 minutes'
    ) as slot
    where exists (select 1 from h)
  )
  select s.slot,
         count(o.id)::integer as taken,
         public.slot_capacity() as capacity,
         exists (select 1 from public.slot_blocks b where b.slot = s.slot) as is_blocked,
         (count(o.id) < public.slot_capacity()
          and s.slot >= now() + public.slot_min_advance()
          and not exists (select 1 from public.slot_blocks b where b.slot = s.slot)) as is_available
  from slots s
  left join public.orders o on o.pickup_slot = s.slot and o.status <> 'cancelado'
  group by s.slot
  order by s.slot;
$$;

create function public.next_available_slot(p_after timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select a.slot
  from public.slot_availability((p_after at time zone 'America/Bogota')::date) a
  where a.slot > p_after and a.is_available
  order by a.slot
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- El personal (cajero y administradora) define el horario y cierra o abre franjas
-- ---------------------------------------------------------------------------
create or replace function public.set_service_hours(p_weekday smallint, p_is_open boolean, p_open time, p_close time)
returns public.service_hours
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.service_hours;
begin
  if not public.is_staff() then
    raise exception 'Solo el personal de la cafetería puede cambiar el horario.' using hint = 'SIN_PERMISO';
  end if;
  if p_open > p_close then
    raise exception 'La hora de apertura debe ser anterior a la de cierre.' using hint = 'HORARIO_INVALIDO';
  end if;
  if extract(minute from p_open)::integer % 15 <> 0 or extract(minute from p_close)::integer % 15 <> 0 then
    raise exception 'Usa horas en franjas de 15 minutos (por ejemplo 6:00, 6:15, 6:30).' using hint = 'HORARIO_INVALIDO';
  end if;

  update public.service_hours
  set is_open = p_is_open, open_time = p_open, close_time = p_close, updated_by = auth.uid(), updated_at = now()
  where weekday = p_weekday
  returning * into v_row;

  if not found then
    raise exception 'Día de la semana inválido.' using hint = 'HORARIO_INVALIDO';
  end if;
  return v_row;
end;
$$;

create or replace function public.set_slot_blocked(p_slot timestamptz, p_blocked boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Solo el personal de la cafetería puede abrir o cerrar franjas.' using hint = 'SIN_PERMISO';
  end if;
  if p_blocked then
    insert into public.slot_blocks (slot, blocked_by) values (p_slot, auth.uid()) on conflict (slot) do nothing;
  else
    delete from public.slot_blocks where slot = p_slot;
  end if;
  return p_blocked;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_order valida contra el horario configurado y los bloqueos
-- ---------------------------------------------------------------------------
create or replace function public.create_order(
  p_items          jsonb,
  p_customer_name  text default null,
  p_pickup_slot    timestamptz default null,
  p_notes          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_role      text := public.current_app_role();
  v_profile   public.profiles;
  v_channel   text;
  v_day       date;
  v_local     timestamp;
  v_hours     public.service_hours;
  v_taken     integer;
  v_next      timestamptz;
  v_turn      integer;
  v_total     integer;
  v_order_id  bigint;
  v_bad       record;
  v_name      text;
begin
  if v_uid is null or v_role is null then
    raise exception 'Debes iniciar sesión para hacer un pedido.' using hint = 'NO_AUTH';
  end if;

  select * into v_profile from public.profiles where id = v_uid;

  if v_role = 'cliente' and p_pickup_slot is null then
    raise exception 'Desde la app solo puedes hacer pedidos anticipados: elige una hora de recogida.' using hint = 'SLOT_REQUERIDO';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe tener al menos un producto.' using hint = 'SIN_PRODUCTOS';
  end if;

  if jsonb_array_length(p_items) > 20 then
    raise exception 'Un pedido admite máximo 20 líneas de productos.' using hint = 'DEMASIADOS_PRODUCTOS';
  end if;

  create temporary table if not exists pg_temp.tmp_items (product_id bigint, quantity integer) on commit drop;
  truncate pg_temp.tmp_items;

  insert into pg_temp.tmp_items (product_id, quantity)
  select (e ->> 'product_id')::bigint, sum((e ->> 'quantity')::integer)
  from jsonb_array_elements(p_items) e
  group by 1;

  if exists (select 1 from pg_temp.tmp_items where product_id is null or quantity is null or quantity < 1 or quantity > 20) then
    raise exception 'Cada producto debe tener una cantidad entre 1 y 20.' using hint = 'CANTIDAD_INVALIDA';
  end if;

  select t.product_id into v_bad
  from pg_temp.tmp_items t left join public.products p on p.id = t.product_id
  where p.id is null limit 1;
  if found then
    raise exception 'Uno de los productos ya no existe en el menú.' using hint = 'PRODUCTO_INEXISTENTE';
  end if;

  select p.name into v_bad
  from pg_temp.tmp_items t join public.products p on p.id = t.product_id
  where not p.available limit 1;
  if found then
    raise exception '% está agotado. Quítalo del pedido para continuar.', v_bad.name using hint = 'AGOTADO';
  end if;

  if p_pickup_slot is null then
    v_channel := 'caja';
    v_day := public.today_bogota();
  else
    v_channel := 'anticipado';
    v_local := p_pickup_slot at time zone 'America/Bogota';
    v_day := v_local::date;

    if extract(minute from v_local)::integer % 15 <> 0 or extract(second from v_local) <> 0 then
      raise exception 'La hora de recogida debe ser una franja de 15 minutos.' using hint = 'FRANJA_INVALIDA';
    end if;

    if v_day > public.today_bogota() + 1 then
      raise exception 'Solo puedes pedir para hoy o para mañana.' using hint = 'FRANJA_INVALIDA';
    end if;

    -- Horario que definió el personal
    select * into v_hours from public.service_hours where weekday = extract(dow from v_day)::smallint;
    if not found or not v_hours.is_open
       or v_local::time < v_hours.open_time or v_local::time > v_hours.close_time then
      raise exception 'La cafetería no recibe pedidos para esa hora. Elige una de las franjas disponibles.' using hint = 'FUERA_DE_HORARIO';
    end if;

    if p_pickup_slot < now() + public.slot_min_advance() then
      v_next := public.next_available_slot(now() + public.slot_min_advance() - interval '1 second');
      raise exception 'Los pedidos anticipados se hacen con al menos 15 minutos de anticipación.'
        using hint = 'ANTICIPACION', detail = coalesce(v_next::text, '');
    end if;

    if exists (select 1 from public.slot_blocks where slot = p_pickup_slot) then
      v_next := public.next_available_slot(p_pickup_slot);
      raise exception 'La cafetería cerró esa franja.' using hint = 'FRANJA_CERRADA', detail = coalesce(v_next::text, '');
    end if;

    perform pg_advisory_xact_lock(hashtextextended('cafe-campus-slot:' || p_pickup_slot::text, 0));

    select count(*) into v_taken
    from public.orders
    where pickup_slot = p_pickup_slot and status <> 'cancelado';

    if v_taken >= public.slot_capacity() then
      v_next := public.next_available_slot(p_pickup_slot);
      raise exception 'La franja elegida ya tiene % pedidos, el máximo que puede preparar la barra.', public.slot_capacity()
        using hint = 'FRANJA_LLENA', detail = coalesce(v_next::text, '');
    end if;
  end if;

  if v_role = 'cliente' then
    v_name := v_profile.full_name;
  else
    v_name := coalesce(nullif(trim(p_customer_name), ''), 'Cliente en caja');
  end if;

  select sum(p.price * t.quantity)::integer into v_total
  from pg_temp.tmp_items t join public.products p on p.id = t.product_id;

  insert into public.daily_turns as d (day, last_turn) values (v_day, 1)
  on conflict (day) do update set last_turn = d.last_turn + 1
  returning last_turn into v_turn;

  insert into public.orders (order_day, turn_number, channel, customer_id, customer_name, pickup_slot, total, notes, created_by)
  values (v_day, v_turn, v_channel, case when v_role = 'cliente' then v_uid end, left(v_name, 60),
          p_pickup_slot, v_total, nullif(left(trim(coalesce(p_notes, '')), 200), ''), v_uid)
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity)
  select v_order_id, p.id, p.name, p.price, t.quantity
  from pg_temp.tmp_items t join public.products p on p.id = t.product_id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by)
  values (v_order_id, null, 'recibido', v_uid);

  return jsonb_build_object(
    'id', v_order_id,
    'turn_number', v_turn,
    'order_day', v_day,
    'total', v_total,
    'channel', v_channel,
    'pickup_slot', p_pickup_slot
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Pedidos de relleno para la demostración: nombres normales y sin nota visible
-- ---------------------------------------------------------------------------
create or replace function public.prepare_demo_slot(p_slot timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product  public.products;
  v_needed   integer;
  v_turn     integer;
  v_day      date := (p_slot at time zone 'America/Bogota')::date;
  v_id       bigint;
  v_names    text[] := array['Valentina R.', 'Santiago M.', 'Camila P.', 'Mateo G.', 'Isabella C.',
                             'Samuel O.', 'Mariana T.', 'Juan José L.', 'Sofía B.', 'Daniel V.'];
begin
  if public.current_app_role() is distinct from 'admin' then
    raise exception 'Solo la administradora puede preparar la demostración.' using hint = 'SIN_PERMISO';
  end if;

  select * into v_product from public.products where available order by price limit 1;
  if not found then
    raise exception 'No hay productos disponibles en el menú.' using hint = 'SIN_PRODUCTOS';
  end if;

  select public.slot_capacity() - count(*) into v_needed
  from public.orders where pickup_slot = p_slot and status <> 'cancelado';

  for i in 1..greatest(v_needed, 0) loop
    insert into public.daily_turns as d (day, last_turn) values (v_day, 1)
    on conflict (day) do update set last_turn = d.last_turn + 1
    returning last_turn into v_turn;

    insert into public.orders (order_day, turn_number, channel, customer_name, pickup_slot, total, is_demo, created_by)
    values (v_day, v_turn, 'anticipado', v_names[1 + (i - 1) % array_length(v_names, 1)], p_slot, v_product.price, true, auth.uid())
    returning id into v_id;

    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity)
    values (v_id, v_product.id, v_product.name, v_product.price, 1);

    insert into public.order_status_history (order_id, from_status, to_status, changed_by)
    values (v_id, null, 'recibido', auth.uid());
  end loop;

  return greatest(v_needed, 0);
end;
$$;

create or replace function public.clear_demo_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if public.current_app_role() is distinct from 'admin' then
    raise exception 'Solo la administradora puede limpiar la demostración.' using hint = 'SIN_PERMISO';
  end if;

  delete from public.orders o
  where o.is_demo and not exists (select 1 from public.payments p where p.order_id = o.id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mensajes al cliente dentro de la app (CAF-06)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  order_id    bigint references public.orders (id) on delete cascade,
  kind        text not null check (kind in ('pedido_listo', 'pedido_cancelado')),
  title       text not null,
  body        text not null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
create policy "mensajes propios" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));

-- El mensaje se crea en la base de datos al cambiar el estado, sin importar desde qué pantalla se movió
create or replace function public.notify_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_money text := '$' || replace(to_char(new.total, 'FM999,999,999'), ',', '.');
begin
  if new.customer_id is null or new.status = old.status then
    return new;
  end if;

  if new.status = 'listo' then
    insert into public.notifications (user_id, order_id, kind, title, body)
    values (new.customer_id, new.id, 'pedido_listo',
            '¡Tu pedido ' || new.turn_number || ' está listo!',
            'Acércate a la barra a recogerlo. Pagas ' || v_money || ' en efectivo o por transferencia.');
  elsif new.status = 'cancelado' and auth.uid() is distinct from new.customer_id then
    insert into public.notifications (user_id, order_id, kind, title, body)
    values (new.customer_id, new.id, 'pedido_cancelado',
            'Tu pedido ' || new.turn_number || ' fue cancelado',
            coalesce('Motivo: ' || new.cancel_reason, 'La cafetería canceló tu pedido.') || ' Si tienes dudas, pregunta en la caja.');
  end if;
  return new;
end;
$$;

create trigger orders_notify_status
  after update of status on public.orders
  for each row execute function public.notify_order_status();

create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notifications
  set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.service_hours;
alter publication supabase_realtime add table public.slot_blocks;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke all on public.service_hours, public.slot_blocks, public.notifications from anon;
revoke insert, update, delete on public.service_hours, public.slot_blocks, public.notifications from authenticated;
revoke execute on all functions in schema public from public, anon;
revoke execute on function public.notify_order_status() from authenticated;

grant execute on function
  public.slot_availability(date), public.next_available_slot(timestamptz),
  public.set_service_hours(smallint, boolean, time, time), public.set_slot_blocked(timestamptz, boolean),
  public.create_order(jsonb, text, timestamptz, text),
  public.prepare_demo_slot(timestamptz), public.clear_demo_orders(),
  public.mark_notifications_read(bigint[])
to authenticated;
