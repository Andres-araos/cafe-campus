-- Café Campus · Turnos de caja (CAF-09, RN-A5)
-- La administradora abre y cierra la caja cuantas veces quiera. Mientras está cerrada,
-- el personal no puede registrar pedidos en caja, mover pedidos, entregar ni cobrar.

create table public.cash_sessions (
  id                bigint generated always as identity primary key,
  opened_at         timestamptz not null default now(),
  opened_by         uuid references public.profiles (id) on delete set null,
  opening_cash      integer not null default 0 check (opening_cash >= 0),   -- base en efectivo (RN-A4)
  closed_at         timestamptz,
  closed_by         uuid references public.profiles (id) on delete set null,
  orders_count      integer,
  cash_total        integer,
  transfer_total    integer,
  total             integer,
  duration_seconds  integer check (duration_seconds >= 0),               -- indicador: tiempo del cierre
  check ((closed_at is null) = (closed_by is null))
);

-- Solo puede haber una caja abierta a la vez
create unique index cash_sessions_one_open on public.cash_sessions ((true)) where closed_at is null;

alter table public.payments add column session_id bigint references public.cash_sessions (id);
create index payments_session_idx on public.payments (session_id);

-- Los cierres que ya existían pasan a ser turnos cerrados, con sus pagos
insert into public.cash_sessions (opened_at, opened_by, closed_at, closed_by, orders_count, cash_total, transfer_total, total, duration_seconds)
select coalesce((select min(p.paid_at) from public.payments p where p.pay_day = c.closing_day), c.closed_at),
       c.closed_by, c.closed_at, c.closed_by, c.orders_count, c.cash_total, c.transfer_total, c.total, c.duration_seconds
from public.cash_closings c;

update public.payments p
set session_id = s.id
from public.cash_sessions s
where p.session_id is null and p.paid_at between s.opened_at and s.closed_at;

drop function public.close_cash(integer);
drop function public.cash_summary(date);
drop table public.cash_closings;

alter table public.cash_sessions enable row level security;
-- El personal la puede leer para enterarse en tiempo real de si la caja está abierta
create policy "turnos visibles al personal" on public.cash_sessions
  for select to authenticated using ((select public.is_staff()));

-- ---------------------------------------------------------------------------
-- Estado de la caja: lo consulta todo el personal
-- ---------------------------------------------------------------------------
create or replace function public.open_cash_session_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.cash_sessions where closed_at is null limit 1;
$$;

create or replace function public.cash_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.cash_sessions;
begin
  if not public.is_staff() then
    raise exception 'Solo el personal de la cafetería puede ver el estado de la caja.' using hint = 'SIN_PERMISO';
  end if;

  select * into v_session from public.cash_sessions where closed_at is null limit 1;
  if found then
    return jsonb_build_object('is_open', true, 'opened_at', v_session.opened_at,
      'opened_by', (select full_name from public.profiles where id = v_session.opened_by));
  end if;

  select * into v_session from public.cash_sessions order by closed_at desc nulls last limit 1;
  return jsonb_build_object('is_open', false, 'closed_at', v_session.closed_at,
    'closed_by', (select full_name from public.profiles where id = v_session.closed_by));
end;
$$;

-- Las operaciones del personal exigen la caja abierta
create or replace function public.require_open_cash()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id bigint := public.open_cash_session_id();
begin
  if v_id is null then
    raise exception 'La caja está cerrada. La administradora debe abrirla para seguir atendiendo.' using hint = 'CAJA_CERRADA';
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Abrir, resumir y cerrar la caja · solo la administradora (RN-A5)
-- ---------------------------------------------------------------------------
create or replace function public.open_cash(p_opening_cash integer default 0)
returns public.cash_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.cash_sessions;
begin
  if public.current_app_role() is distinct from 'admin' then
    raise exception 'Solo la administradora puede abrir la caja.' using hint = 'SIN_PERMISO';
  end if;
  if coalesce(p_opening_cash, 0) < 0 then
    raise exception 'La base en efectivo no puede ser negativa.' using hint = 'MONTO_INVALIDO';
  end if;
  if public.open_cash_session_id() is not null then
    raise exception 'La caja ya está abierta.' using hint = 'CAJA_ABIERTA';
  end if;

  insert into public.cash_sessions (opened_by, opening_cash)
  values (auth.uid(), coalesce(p_opening_cash, 0))
  returning * into v_session;
  return v_session;
end;
$$;

create or replace function public.cash_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.cash_sessions;
  v_today   date := public.today_bogota();
begin
  if public.current_app_role() is distinct from 'admin' then
    raise exception 'Solo la administradora puede ver la caja.' using hint = 'SIN_PERMISO';
  end if;

  select * into v_session from public.cash_sessions where closed_at is null limit 1;

  return jsonb_build_object(
    'is_open', v_session.id is not null,
    'session', case when v_session.id is null then null else jsonb_build_object(
      'id', v_session.id,
      'opened_at', v_session.opened_at,
      'opened_by', (select full_name from public.profiles where id = v_session.opened_by),
      'opening_cash', v_session.opening_cash,
      'orders_count', (select count(*) from public.payments where session_id = v_session.id),
      'cash_total', (select coalesce(sum(amount), 0) from public.payments where session_id = v_session.id and method = 'efectivo'),
      'transfer_total', (select coalesce(sum(amount), 0) from public.payments where session_id = v_session.id and method = 'transferencia'),
      'total', (select coalesce(sum(amount), 0) from public.payments where session_id = v_session.id)
    ) end,
    'pending_orders', (select count(*) from public.orders
                       where order_day = v_today and status in ('recibido', 'en_preparacion', 'listo')),
    'today', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', s.id, 'opened_at', s.opened_at, 'closed_at', s.closed_at,
                'opening_cash', s.opening_cash, 'cash_total', s.cash_total, 'transfer_total', s.transfer_total,
                'total', s.total, 'orders_count', s.orders_count, 'duration_seconds', s.duration_seconds,
                'closed_by', (select full_name from public.profiles where id = s.closed_by)
              ) order by s.opened_at desc), '[]'::jsonb)
              from public.cash_sessions s
              where s.closed_at is not null and (s.closed_at at time zone 'America/Bogota')::date = v_today)
  );
end;
$$;

create or replace function public.close_cash(p_duration_seconds integer default null)
returns public.cash_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.cash_sessions;
begin
  if public.current_app_role() is distinct from 'admin' then
    raise exception 'Solo la administradora puede cerrar la caja.' using hint = 'SIN_PERMISO';
  end if;

  select * into v_session from public.cash_sessions where closed_at is null for update;
  if not found then
    raise exception 'La caja ya está cerrada.' using hint = 'CAJA_CERRADA';
  end if;

  update public.cash_sessions s
  set closed_at = now(),
      closed_by = auth.uid(),
      orders_count = t.n,
      cash_total = t.cash,
      transfer_total = t.transfer,
      total = t.total,
      duration_seconds = greatest(p_duration_seconds, 0)
  from (
    select count(*)::integer as n,
           coalesce(sum(amount) filter (where method = 'efectivo'), 0)::integer as cash,
           coalesce(sum(amount) filter (where method = 'transferencia'), 0)::integer as transfer,
           coalesce(sum(amount), 0)::integer as total
    from public.payments where session_id = v_session.id
  ) t
  where s.id = v_session.id
  returning s.* into v_session;

  return v_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- Operaciones del personal: exigen la caja abierta
-- ---------------------------------------------------------------------------
create or replace function public.deliver_order(p_order_id bigint, p_method text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order   public.orders;
  v_session bigint;
begin
  if not public.is_staff() then
    raise exception 'Solo el personal de la cafetería puede registrar pagos.' using hint = 'SIN_PERMISO';
  end if;

  v_session := public.require_open_cash();

  if p_method not in ('efectivo', 'transferencia') then
    raise exception 'El pago debe ser en efectivo o por transferencia.' using hint = 'METODO_INVALIDO';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'El pedido no existe.' using hint = 'NO_EXISTE';
  end if;

  if v_order.status <> 'listo' then
    raise exception 'Solo se entregan pedidos en estado "Listo".' using hint = 'TRANSICION_INVALIDA';
  end if;

  insert into public.payments (order_id, method, amount, received_by, session_id)
  values (p_order_id, p_method, v_order.total, auth.uid(), v_session);

  update public.orders
  set status = 'entregado', delivered_at = now()
  where id = p_order_id
  returning * into v_order;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by)
  values (p_order_id, 'listo', 'entregado', auth.uid());

  return v_order;
end;
$$;

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

  perform public.require_open_cash();

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

  -- El cliente puede cancelar su pedido aunque la caja esté cerrada; el personal no
  if public.is_staff() then
    perform public.require_open_cash();
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

-- Pedido en caja: exige caja abierta. Se envuelve create_order para no repetir sus reglas.
create or replace function public.guard_staff_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.channel = 'caja' and not new.is_demo then
    perform public.require_open_cash();
  end if;
  return new;
end;
$$;

create trigger orders_require_open_cash
  before insert on public.orders
  for each row execute function public.guard_staff_order();

-- ---------------------------------------------------------------------------
-- Indicadores con los turnos de caja
-- ---------------------------------------------------------------------------
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
    'orders_total', (select count(*) from public.orders where order_day = v_day and not is_demo),
    'orders_delivered', (select count(*) from public.orders where order_day = v_day and status = 'entregado'),
    'orders_cancelled', (select count(*) from public.orders where order_day = v_day and status = 'cancelado' and not is_demo),
    'orders_advance', (select count(*) from public.orders where order_day = v_day and channel = 'anticipado' and not is_demo),
    'orders_without_trace', (select count(*) from public.orders o where o.order_day = v_day
                             and not exists (select 1 from public.order_status_history h where h.order_id = o.id)),
    'avg_minutes_to_ready', (select round(avg(extract(epoch from (ready_at - created_at)) / 60)::numeric, 1)
                             from public.orders where order_day = v_day and channel = 'caja' and ready_at is not null),
    'last_closing_seconds', (select duration_seconds from public.cash_sessions
                             where duration_seconds is not null order by closed_at desc limit 1),
    'closings', (select coalesce(jsonb_agg(jsonb_build_object('closed_at', closed_at, 'seconds', duration_seconds, 'total', total)
                                           order by closed_at desc), '[]'::jsonb)
                 from (select * from public.cash_sessions where closed_at is not null order by closed_at desc limit 10) c)
  );
end;
$$;

alter publication supabase_realtime add table public.cash_sessions;

revoke all on public.cash_sessions from anon;
revoke insert, update, delete on public.cash_sessions from authenticated;
revoke execute on all functions in schema public from public, anon;
revoke execute on function public.guard_staff_order(), public.require_open_cash(), public.open_cash_session_id() from authenticated;

grant execute on function
  public.cash_status(), public.open_cash(integer), public.cash_summary(), public.close_cash(integer),
  public.deliver_order(bigint, text), public.move_order(bigint, text), public.cancel_order(bigint, text),
  public.impact_indicators(date)
to authenticated;
