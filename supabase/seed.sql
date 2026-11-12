-- Café Campus · Datos de prueba (sección 4.8 de la guía) · CAF-T06
-- Ejecutar una vez en el SQL Editor de Supabase. Es idempotente: se puede volver a correr.
-- Contraseña de todos los usuarios de prueba: CafeCampus2026!

-- Menú de referencia (los precios son valores de prueba, no una fuente oficial)
insert into public.products (name, category, price, available) values
  ('Café tinto 7 oz',      'Bebidas calientes',  2000, true),
  ('Café con leche',       'Bebidas calientes',  3500, true),
  ('Empanada de carne',    'Panadería',          3000, true),
  ('Pandebono',            'Panadería',          2500, false),  -- agotado: prueba RN-A2
  ('Jugo natural en agua', 'Bebidas frías',      5000, true),
  ('Almuerzo del día',     'Almuerzos',         14000, true)
on conflict ((lower(trim(name)))) do update
  set category = excluded.category, price = excluded.price, available = excluded.available;

-- Usuarios de prueba: administradora, cajero y dos clientes del flujo de demostración (4.10)
do $$
declare
  v_user record;
  v_id   uuid;
begin
  for v_user in
    select * from (values
      ('patricia@cafecampus.test', 'Patricia Gómez', 'admin'),
      ('esteban@cafecampus.test',  'Esteban Ruiz',   'cajero'),
      ('rosa@cafecampus.test',     'Rosa Pérez',     'cajero'),
      ('laura@cafecampus.test',    'Laura Méndez',   'cliente'),
      ('diego@cafecampus.test',    'Diego Ríos',     'cliente')
    ) as t(email, full_name, role)
  loop
    select id into v_id from auth.users where email = v_user.email;

    if v_id is null then
      v_id := gen_random_uuid();

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_user.email,
        extensions.crypt('CafeCampus2026!', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', v_user.full_name, 'data_consent', true),
        now(), now(), '', '', '', ''
      );

      insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (
        v_id::text, v_id,
        jsonb_build_object('sub', v_id::text, 'email', v_user.email, 'email_verified', true),
        'email', now(), now(), now()
      );
    end if;

    update public.profiles set role = v_user.role where id = v_id;
  end loop;
end;
$$;
