-- Café Campus · Reglas de negocio en la base de datos
-- Toda escritura de pedidos, pagos y cierres pasa por estas funciones, para que las reglas
-- se cumplan aunque alguien llame a la API sin usar la app.

-- El correo ayuda a la administradora a encontrar usuarios para asignarles rol
alter table public.profiles add column email text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, data_consent_at)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email,
    case when (new.raw_user_meta_data ->> 'data_consent')::boolean then now() end
  );
  return new;
end;
$$;

-- Parámetros del negocio en un solo sitio
create or replace function public.cafe_tz() returns text
language sql immutable set search_path = '' as $$ select 'America/Bogota' $$;

create or replace function public.today_bogota() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'America/Bogota')::date $$;

-- RN-A3: capacidad de la barra por franja de 15 minutos y anticipación mínima
create or replace function public.slot_capacity() returns integer
language sql immutable set search_path = '' as $$ select 10 $$;

create or replace function public.slot_min_advance() returns interval
language sql immutable set search_path = '' as $$ select interval '15 minutes' $$;

-- ---------------------------------------------------------------------------
-- Disponibilidad de franjas (CAF-05, RN-A3)
-- ---------------------------------------------------------------------------
create or replace function public.slot_availability(p_day date default null)
returns table (slot timestamptz, taken integer, capacity integer, is_available boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with days as (select coalesce(p_day, public.today_bogota()) as d),
  slots as (
    select generate_series(
      ((select d from days) + time '06:00') at time zone 'America/Bogota',
      ((select d from days) + time '19:45') at time zone 'America/Bogota',
      interval '15 minutes'
    ) as slot
  )
  select s.slot,
         count(o.id)::integer as taken,
         public.slot_capacity() as capacity,
         (count(o.id) < public.slot_capacity() and s.slot >= now() + public.slot_min_advance()) as is_available
  from slots s
  left join public.orders o on o.pickup_slot = s.slot and o.status <> 'cancelado'
  group by s.slot
  order by s.slot;
$$;

create or replace function public.next_available_slot(p_after timestamptz)
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
-- Crear pedido (CAF-03 en caja, CAF-05 anticipado) · RN-A1, RN-A2, RN-A3, RN-A4
-- p_items: [{"product_id": 1, "quantity": 2}, ...]
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

  -- Normaliza las líneas (suma productos repetidos) y valida cantidades
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

  -- RN-A2: un producto agotado no se puede pedir
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

    -- RN-A3: franjas de 15 minutos dentro del horario de atención
    if extract(minute from v_local)::integer % 15 <> 0 or extract(second from v_local) <> 0
       or v_local::time < time '06:00' or v_local::time > time '19:45' then
      raise exception 'La hora de recogida debe ser una franja de 15 minutos entre 6:00 a. m. y 7:45 p. m.' using hint = 'FRANJA_INVALIDA';
    end if;

    if v_day > public.today_bogota() + 1 then
      raise exception 'Solo puedes pedir para hoy o para mañana.' using hint = 'FRANJA_INVALIDA';
    end if;

    -- RN-A3: mínimo 15 minutos de anticipación
    if p_pickup_slot < now() + public.slot_min_advance() then
      v_next := public.next_available_slot(now() + public.slot_min_advance() - interval '1 second');
      raise exception 'Los pedidos anticipados se hacen con al menos 15 minutos de anticipación.'
        using hint = 'ANTICIPACION', detail = coalesce(v_next::text, '');
    end if;

    -- RN-A3: máximo 10 pedidos por franja. El bloqueo evita que dos clientes tomen el último cupo a la vez.
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

  -- RN-A4: el total se calcula aquí con los precios vigentes, nunca con lo que envía la app
  select sum(p.price * t.quantity)::integer into v_total
  from pg_temp.tmp_items t join public.products p on p.id = t.product_id;

  -- RN-A1: número de turno único en el día, sin choques entre cajas
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
-- Mover un pedido por el tablero de la barra (CAF-04) · RN-A1
-- Avanza un paso, o retrocede uno para corregir un error sin miedo.
-- ---------------------------------------------------------------------------
create or replace function public.move_order(p_order_id bigint, p_to_status text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_from  text;
  v_ok    boolean;
begin
  if not public.is_staff() then
    raise exception 'Solo el personal de la cafetería puede mover pedidos.' using hint = 'SIN_PERMISO';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'El pedido no existe.' using hint = 'NO_EXISTE';
  end if;

  v_from := v_order.status;
  v_ok := (v_order.status, p_to_status) in (
    ('recibido', 'en_preparacion'),
    ('en_preparacion', 'listo'),
    ('en_preparacion', 'recibido'),
    ('listo', 'en_preparacion')
  );

  if not v_ok then
    raise exception 'No se puede pasar un pedido de "%" a "%".', v_order.status, p_to_status using hint = 'TRANSICION_INVALIDA';
  end if;

  update public.orders
  set status = p_to_status,
      ready_at = case when p_to_status = 'listo' then now() else null end
  where id = p_order_id
  returning * into v_order;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by)
  values (p_order_id, v_from, p_to_status, auth.uid());

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Entregar y cobrar (CAF-08) · RN-A6
-- ---------------------------------------------------------------------------
create or replace function public.deliver_order(p_order_id bigint, p_method text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if not public.is_staff() then
    raise exception 'Solo el personal de la cafetería puede registrar pagos.' using hint = 'SIN_PERMISO';
  end if;

  if p_method not in ('efectivo', 'transferencia') then
    raise exception 'El pago debe ser en efectivo o por transferencia.' using hint = 'METODO_INVALIDO';
  end if;

  if exists (select 1 from public.cash_closings where closing_day = public.today_bogota()) then
    raise exception 'La caja de hoy ya se cerró. No se pueden registrar más pagos hoy.' using hint = 'CAJA_CERRADA';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'El pedido no existe.' using hint = 'NO_EXISTE';
  end if;

  if v_order.status <> 'listo' then
    raise exception 'Solo se entregan pedidos en estado "Listo".' using hint = 'TRANSICION_INVALIDA';
  end if;

  insert into public.payments (order_id, method, amount, received_by)
  values (p_order_id, p_method, v_order.total, auth.uid());

  update public.orders
  set status = 'entregado', delivered_at = now()
  where id = p_order_id
  returning * into v_order;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by)
  values (p_order_id, 'listo', 'entregado', auth.uid());

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancelar un pedido no entregado
-- El personal puede cancelar cualquiera; el cliente, solo el suyo mientras siga en "recibido".
-- ---------------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id bigint, p_reason text default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'El pedido no existe.' using hint = 'NO_EXISTE';
  end if;

  if not public.is_staff() and not (v_order.customer_id = auth.uid() and v_order.status = 'recibido') then
    raise exception 'No puedes cancelar este pedido.' using hint = 'SIN_PERMISO';
  end if;

  if v_order.status in ('entregado', 'cancelado') then
    raise exception 'El pedido ya está %.', v_order.status using hint = 'TRANSICION_INVALIDA';
  end if;

  update public.orders
  set status = 'cancelado', cancel_reason = nullif(left(trim(coalesce(p_reason, '')), 200), '')
  where id = p_order_id
  returning * into v_order;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by)
  select p_order_id, h.to_status, 'cancelado', auth.uid()
  from public.order_status_history h where h.order_id = p_order_id order by h.id desc limit 1;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cierre de caja (CAF-09) · RN-A5
-- ---------------------------------------------------------------------------
create or replace function public.cash_summary(p_day date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day     date := coalesce(p_day, public.today_bogota());
  v_result  jsonb;
begin
  if public.current_app_role() is distinct from 'admin' then
    raise exception 'Solo la administradora puede ver el cierre de caja.' using hint = 'SIN_PERMISO';
  end if;

  select jsonb_build_object(
    'day', v_day,
    'orders_count', count(p.id),
    'cash_total', coalesce(sum(p.amount) filter (where p.method = 'efectivo'), 0),
    'transfer_total', coalesce(sum(p.amount) filter (where p.method = 'transferencia'), 0),
    'total', coalesce(sum(p.amount), 0),
    'pending_orders', (select count(*) from public.orders o
                       where o.order_day = v_day and o.status in ('recibido', 'en_preparacion', 'listo')),
    'closing', (select to_jsonb(c) from public.cash_closings c where c.closing_day = v_day)
  )
  into v_result
  from public.payments p
  where p.pay_day = v_day;

  return v_result;
end;
$$;

create or replace function public.close_cash(p_duration_seconds integer default null)
returns public.cash_closings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day     date := public.today_bogota();
  v_closing public.cash_closings;
begin
  if public.current_app_role() is distinct from 'admin' then
    raise exception 'Solo la administradora puede hacer el cierre de caja.' using hint = 'SIN_PERMISO';
  end if;

  if exists (select 1 from public.cash_closings where closing_day = v_day) then
    raise exception 'La caja de hoy ya está cerrada.' using hint = 'CAJA_CERRADA';
  end if;

  insert into public.cash_closings (closing_day, orders_count, cash_total, transfer_total, total, duration_seconds, closed_by)
  select v_day,
         count(*),
         coalesce(sum(amount) filter (where method = 'efectivo'), 0),
         coalesce(sum(amount) filter (where method = 'transferencia'), 0),
         coalesce(sum(amount), 0),
         greatest(p_duration_seconds, 0),
         auth.uid()
  from public.payments
  where pay_day = v_day
  returning * into v_closing;

  return v_closing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ventas por producto y franja horaria (CAF-10) e indicadores de impacto
-- La franja es la hora en que el cliente quiere el producto: la de recogida si es anticipado.
-- ---------------------------------------------------------------------------
create or replace function public.sales_report(p_from date, p_to date)
returns table (product_name text, hour_of_day integer, quantity bigint, revenue bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_app_role() is distinct from 'admin' then
    raise exception 'Solo la administradora puede ver los reportes.' using hint = 'SIN_PERMISO';
  end if;

  return query
  select i.product_name,
         extract(hour from (coalesce(o.pickup_slot, o.created_at) at time zone 'America/Bogota'))::integer,
         sum(i.quantity)::bigint,
         sum(i.subtotal)::bigint
  from public.order_items i
  join public.orders o on o.id = i.order_id
  where o.status = 'entregado'
    and o.order_day between p_from and p_to
  group by 1, 2
  order by 2, 1;
end;
$$;

create or replace function public.impact_indicators(p_day date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day date := coalesce(p_day, public.today_bogota());
begin
  if public.current_app_role() is distinct from 'admin' then
    raise exception 'Solo la administradora puede ver los indicadores.' using hint = 'SIN_PERMISO';
  end if;

  return jsonb_build_object(
    'day', v_day,
    'orders_total', (select count(*) from public.orders where order_day = v_day),
    'orders_delivered', (select count(*) from public.orders where order_day = v_day and status = 'entregado'),
    'orders_cancelled', (select count(*) from public.orders where order_day = v_day and status = 'cancelado'),
    'orders_advance', (select count(*) from public.orders where order_day = v_day and channel = 'anticipado'),
    -- Pedidos con número de turno, estado y responsable: ninguno queda sin rastro (indicador 2)
    'orders_without_trace', (select count(*) from public.orders o where o.order_day = v_day
                             and not exists (select 1 from public.order_status_history h where h.order_id = o.id)),
    -- Minutos promedio desde que la caja registra el pedido hasta que la barra lo marca listo
    'avg_minutes_to_ready', (select round(avg(extract(epoch from (ready_at - created_at)) / 60)::numeric, 1)
                             from public.orders where order_day = v_day and channel = 'caja' and ready_at is not null),
    -- Indicador 4: duración del último cierre de caja
    'last_closing_seconds', (select duration_seconds from public.cash_closings
                             where duration_seconds is not null order by closing_day desc limit 1),
    'closings', (select coalesce(jsonb_agg(jsonb_build_object('day', closing_day, 'seconds', duration_seconds, 'total', total)
                                           order by closing_day desc), '[]'::jsonb)
                 from (select * from public.cash_closings order by closing_day desc limit 10) c)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Carga del menú desde hoja de cálculo (CAF-12)
-- p_rows: [{"name": "...", "category": "...", "price": 2000, "available": true}, ...]
-- ---------------------------------------------------------------------------
create or replace function public.import_products(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row       jsonb;
  v_idx       integer := 0;
  v_inserted  integer := 0;
  v_updated   integer := 0;
  v_existing  bigint;
begin
  if public.current_app_role() is distinct from 'admin' then
    raise exception 'Solo la administradora puede cargar el menú.' using hint = 'SIN_PERMISO';
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'El archivo no tiene filas para cargar.' using hint = 'SIN_FILAS';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    begin
      select id into v_existing from public.products where lower(trim(name)) = lower(trim(v_row ->> 'name'));
      if found then
        update public.products
        set category = v_row ->> 'category',
            price = (v_row ->> 'price')::integer,
            available = coalesce((v_row ->> 'available')::boolean, true)
        where id = v_existing;
        v_updated := v_updated + 1;
      else
        insert into public.products (name, category, price, available)
        values (trim(v_row ->> 'name'), v_row ->> 'category', (v_row ->> 'price')::integer,
                coalesce((v_row ->> 'available')::boolean, true));
        v_inserted := v_inserted + 1;
      end if;
    exception when others then
      raise exception 'Fila % (%): datos inválidos. Revisa nombre, categoría y precio entero.', v_idx + 1, coalesce(v_row ->> 'name', 'sin nombre')
        using hint = 'FILA_INVALIDA';
    end;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
end;
$$;

-- ---------------------------------------------------------------------------
-- Gestión de roles (CAF-01) · solo la administradora
-- ---------------------------------------------------------------------------
create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if public.current_app_role() is distinct from 'admin' then
    raise exception 'Solo la administradora puede asignar roles.' using hint = 'SIN_PERMISO';
  end if;

  if p_role not in ('admin', 'cajero', 'cliente') then
    raise exception 'Rol inválido.' using hint = 'ROL_INVALIDO';
  end if;

  if p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception 'No puedes quitarte tu propio rol de administradora.' using hint = 'SIN_PERMISO';
  end if;

  update public.profiles set role = p_role where id = p_user_id returning * into v_profile;
  if not found then
    raise exception 'El usuario no existe.' using hint = 'NO_EXISTE';
  end if;

  return v_profile;
end;
$$;

-- El usuario puede actualizar su nombre y su consentimiento, nunca su rol
create or replace function public.update_my_profile(p_full_name text, p_data_consent boolean)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  update public.profiles
  set full_name = trim(p_full_name),
      data_consent_at = case when p_data_consent then coalesce(data_consent_at, now()) else null end
  where id = auth.uid()
  returning * into v_profile;
  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- Preparar la demostración (RN-A3): llena una franja con 10 pedidos de prueba
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

    insert into public.orders (order_day, turn_number, channel, customer_name, pickup_slot, total, notes, created_by)
    values (v_day, v_turn, 'anticipado', 'Pedido de prueba ' || i, p_slot, v_product.price, 'DEMO', auth.uid())
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
  where o.notes = 'DEMO' and not exists (select 1 from public.payments p where p.order_id = o.id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos: nada para anónimos; las funciones internas no se exponen
-- ---------------------------------------------------------------------------
revoke all on public.daily_turns from anon, authenticated;
revoke execute on all functions in schema public from public, anon;

grant execute on function
  public.current_app_role(), public.is_staff(), public.today_bogota(),
  public.slot_availability(date), public.next_available_slot(timestamptz),
  public.create_order(jsonb, text, timestamptz, text),
  public.move_order(bigint, text), public.deliver_order(bigint, text), public.cancel_order(bigint, text),
  public.cash_summary(date), public.close_cash(integer),
  public.sales_report(date, date), public.impact_indicators(date),
  public.import_products(jsonb), public.set_user_role(uuid, text), public.update_my_profile(text, boolean),
  public.prepare_demo_slot(timestamptz), public.clear_demo_orders()
to authenticated;

revoke execute on function public.handle_new_user() from authenticated;
revoke insert, update, delete on public.orders, public.order_items, public.order_status_history,
  public.payments, public.cash_closings, public.profiles from anon, authenticated;
revoke all on all tables in schema public from anon;
