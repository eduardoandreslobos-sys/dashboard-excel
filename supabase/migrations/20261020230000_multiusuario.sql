-- Dashboard Excel multiusuario: perfiles, espacios de trabajo, dashboards, permisos y auditoría.
-- Toda la seguridad vive en RLS: aunque alguien manipule el cliente, Postgres solo devuelve lo permitido.

-- ---------------------------------------------------------------- tipos

create type public.rol_plataforma as enum ('admin', 'miembro');
create type public.estado_usuario as enum ('activo', 'suspendido');
create type public.rol_espacio as enum ('propietario', 'editor', 'lector');
create type public.visibilidad_dashboard as enum ('privado', 'plataforma');
create type public.nivel_permiso as enum ('lector', 'editor');

-- ---------------------------------------------------------------- tablas

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nombre text not null default '',
  avatar_url text,
  rol public.rol_plataforma not null default 'miembro',
  estado public.estado_usuario not null default 'activo',
  creado_en timestamptz not null default now(),
  ultimo_acceso timestamptz
);
create unique index profiles_email_idx on public.profiles (lower(email));

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  personal boolean not null default false,
  creado_en timestamptz not null default now()
);
create index workspaces_owner_idx on public.workspaces (owner_id);

create table public.workspace_miembros (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rol public.rol_espacio not null,
  creado_en timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_miembros_user_idx on public.workspace_miembros (user_id);

create table public.dashboards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 120),
  descripcion text not null default '' check (char_length(descripcion) <= 500),
  visibilidad public.visibilidad_dashboard not null default 'privado',
  enlace_publico text unique,
  archivo_path text,
  archivo_nombre text,
  archivo_tamano bigint,
  config jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index dashboards_owner_idx on public.dashboards (owner_id);
create index dashboards_workspace_idx on public.dashboards (workspace_id);
create index dashboards_visibilidad_idx on public.dashboards (visibilidad) where visibilidad = 'plataforma';

create table public.dashboard_permisos (
  dashboard_id uuid not null references public.dashboards (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  nivel public.nivel_permiso not null,
  otorgado_por uuid references public.profiles (id) on delete set null,
  creado_en timestamptz not null default now(),
  primary key (dashboard_id, user_id)
);
create index dashboard_permisos_user_idx on public.dashboard_permisos (user_id);

create table public.auditoria (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  accion text not null,
  objetivo_tipo text not null,
  objetivo_id text,
  detalle jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);
create index auditoria_creado_idx on public.auditoria (creado_en desc);

-- ---------------------------------------------------------------- funciones de acceso
-- security definer + search_path vacío: se usan dentro de políticas sin recursión de RLS.

create function public.es_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and rol = 'admin' and estado = 'activo'
  );
$$;

create function public.puede_ver_dashboard(d uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.dashboards x
    where x.id = d and (
      x.owner_id = auth.uid()
      or x.visibilidad = 'plataforma'
      or exists (select 1 from public.dashboard_permisos p where p.dashboard_id = x.id and p.user_id = auth.uid())
      or public.es_admin()
    )
  );
$$;

create function public.puede_editar_dashboard(d uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.dashboards x
    where x.id = d and (
      x.owner_id = auth.uid()
      or exists (select 1 from public.dashboard_permisos p
                 where p.dashboard_id = x.id and p.user_id = auth.uid() and p.nivel = 'editor')
      or public.es_admin()
    )
  );
$$;

create function public.es_dueno_dashboard(d uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.dashboards where id = d and owner_id = auth.uid())
      or public.es_admin();
$$;

create function public.es_miembro_espacio(w uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_miembros where workspace_id = w and user_id = auth.uid());
$$;

-- Registro de auditoría (lo llaman los triggers y las acciones de admin del servidor).
create function public.registrar(p_accion text, p_tipo text, p_id text, p_detalle jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.auditoria (actor_id, accion, objetivo_tipo, objetivo_id, detalle)
  values (auth.uid(), p_accion, p_tipo, p_id, coalesce(p_detalle, '{}'::jsonb));
$$;

-- Buscar a una persona para compartir: solo por correo exacto (evita listar a todos los usuarios).
create function public.buscar_usuario_por_email(p_email text)
returns table (id uuid, nombre text, email text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nombre, p.email from public.profiles p
  where auth.uid() is not null and lower(p.email) = lower(trim(p_email)) and p.estado = 'activo'
  limit 1;
$$;

-- Nombres y correos de las personas vinculadas a dashboards que el usuario puede ver.
create function public.perfiles_visibles(p_ids uuid[])
returns table (id uuid, nombre text, email text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nombre, p.email, p.avatar_url from public.profiles p
  where auth.uid() is not null and p.id = any (p_ids) and (
    p.id = auth.uid()
    or public.es_admin()
    or exists (select 1 from public.dashboards d where d.owner_id = p.id and public.puede_ver_dashboard(d.id))
    or exists (select 1 from public.dashboard_permisos dp where dp.user_id = p.id and public.puede_ver_dashboard(dp.dashboard_id))
  );
$$;

-- ---------------------------------------------------------------- triggers

-- Alta de usuario: perfil + espacio personal. El primer administrador queda definido por correo.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_nombre text := coalesce(nullif(new.raw_user_meta_data ->> 'nombre', ''), split_part(new.email, '@', 1));
  v_ws uuid;
begin
  insert into public.profiles (id, email, nombre, rol)
  values (new.id, new.email, v_nombre,
          case when lower(new.email) = 'eduardoandreslobos@gmail.com' then 'admin'::public.rol_plataforma
               else 'miembro'::public.rol_plataforma end);
  insert into public.workspaces (nombre, owner_id, personal)
  values ('Espacio de ' || v_nombre, new.id, true) returning id into v_ws;
  insert into public.workspace_miembros (workspace_id, user_id, rol) values (v_ws, new.id, 'propietario');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantiene el correo del perfil al día si el usuario lo cambia.
create function public.handle_user_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;
create trigger on_auth_user_email after update of email on auth.users
  for each row execute function public.handle_user_email();

-- Solo un admin (o el servidor con service role, sin auth.uid()) cambia rol y estado.
create function public.proteger_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.es_admin()
     and (new.rol is distinct from old.rol or new.estado is distinct from old.estado
          or new.email is distinct from old.email or new.id is distinct from old.id) then
    raise exception 'No tienes permiso para cambiar el rol, el estado o el correo.' using errcode = '42501';
  end if;
  if new.rol is distinct from old.rol or new.estado is distinct from old.estado then
    perform public.registrar('perfil.' || case when new.rol is distinct from old.rol then 'rol' else 'estado' end,
      'usuario', new.id::text,
      jsonb_build_object('email', new.email, 'antes', jsonb_build_object('rol', old.rol, 'estado', old.estado),
                         'despues', jsonb_build_object('rol', new.rol, 'estado', new.estado)));
  end if;
  return new;
end;
$$;
create trigger proteger_perfil before update on public.profiles
  for each row execute function public.proteger_perfil();

-- Editores pueden cambiar contenido; visibilidad, enlace público, dueño y espacio solo el dueño o un admin.
create function public.proteger_dashboard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.es_dueno_dashboard(old.id)
     and (new.visibilidad is distinct from old.visibilidad or new.enlace_publico is distinct from old.enlace_publico
          or new.owner_id is distinct from old.owner_id or new.workspace_id is distinct from old.workspace_id) then
    raise exception 'Solo el dueño puede cambiar la visibilidad o el enlace público.' using errcode = '42501';
  end if;
  new.actualizado_en := now();
  return new;
end;
$$;
create trigger proteger_dashboard before update on public.dashboards
  for each row execute function public.proteger_dashboard();

create function public.auditar_dashboard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.registrar('dashboard.crear', 'dashboard', new.id::text, jsonb_build_object('titulo', new.titulo));
  elsif tg_op = 'DELETE' then
    perform public.registrar('dashboard.eliminar', 'dashboard', old.id::text, jsonb_build_object('titulo', old.titulo));
    return old;
  else
    if new.visibilidad is distinct from old.visibilidad then
      perform public.registrar('dashboard.visibilidad', 'dashboard', new.id::text,
        jsonb_build_object('titulo', new.titulo, 'visibilidad', new.visibilidad));
    end if;
    if new.enlace_publico is distinct from old.enlace_publico then
      perform public.registrar(case when new.enlace_publico is null then 'dashboard.enlace_revocado' else 'dashboard.enlace_creado' end,
        'dashboard', new.id::text, jsonb_build_object('titulo', new.titulo));
    end if;
  end if;
  return new;
end;
$$;
create trigger auditar_dashboard after insert or update or delete on public.dashboards
  for each row execute function public.auditar_dashboard();

create function public.auditar_permiso() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform public.registrar('permiso.quitar', 'dashboard', old.dashboard_id::text, jsonb_build_object('usuario', old.user_id));
    return old;
  end if;
  perform public.registrar(case when tg_op = 'INSERT' then 'permiso.otorgar' else 'permiso.cambiar' end,
    'dashboard', new.dashboard_id::text, jsonb_build_object('usuario', new.user_id, 'nivel', new.nivel));
  return new;
end;
$$;
create trigger auditar_permiso after insert or update or delete on public.dashboard_permisos
  for each row execute function public.auditar_permiso();

-- ---------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_miembros enable row level security;
alter table public.dashboards enable row level security;
alter table public.dashboard_permisos enable row level security;
alter table public.auditoria enable row level security;

create policy "perfil propio o admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.es_admin());
create policy "editar perfil propio o admin" on public.profiles for update to authenticated
  using (id = auth.uid() or public.es_admin()) with check (id = auth.uid() or public.es_admin());

create policy "ver espacios propios" on public.workspaces for select to authenticated
  using (owner_id = auth.uid() or public.es_miembro_espacio(id) or public.es_admin());
create policy "crear espacio propio" on public.workspaces for insert to authenticated
  with check (owner_id = auth.uid());
create policy "editar espacio propio" on public.workspaces for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "ver miembros de mis espacios" on public.workspace_miembros for select to authenticated
  using (user_id = auth.uid() or public.es_miembro_espacio(workspace_id) or public.es_admin());

create policy "ver dashboards permitidos" on public.dashboards for select to authenticated
  using (public.puede_ver_dashboard(id));
create policy "crear dashboard en mi espacio" on public.dashboards for insert to authenticated
  with check (owner_id = auth.uid() and exists (
    select 1 from public.workspace_miembros m
    where m.workspace_id = dashboards.workspace_id and m.user_id = auth.uid() and m.rol in ('propietario', 'editor')));
create policy "editar dashboards permitidos" on public.dashboards for update to authenticated
  using (public.puede_editar_dashboard(id)) with check (public.puede_editar_dashboard(id));
create policy "eliminar dashboard propio" on public.dashboards for delete to authenticated
  using (public.es_dueno_dashboard(id));

create policy "ver permisos" on public.dashboard_permisos for select to authenticated
  using (user_id = auth.uid() or public.es_dueno_dashboard(dashboard_id));
create policy "otorgar permisos" on public.dashboard_permisos for insert to authenticated
  with check (public.es_dueno_dashboard(dashboard_id) and user_id <> auth.uid() and otorgado_por = auth.uid());
create policy "cambiar permisos" on public.dashboard_permisos for update to authenticated
  using (public.es_dueno_dashboard(dashboard_id)) with check (public.es_dueno_dashboard(dashboard_id));
create policy "quitar permisos" on public.dashboard_permisos for delete to authenticated
  using (public.es_dueno_dashboard(dashboard_id) or user_id = auth.uid());

create policy "auditoria solo admin" on public.auditoria for select to authenticated
  using (public.es_admin());

-- Permisos explícitos por tabla (el proyecto no expone tablas nuevas automáticamente).
-- Los anónimos no reciben nada; los autenticados operan siempre bajo RLS.
grant usage on schema public to anon, authenticated, service_role;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.workspaces to authenticated;
grant select on public.workspace_miembros to authenticated;
grant select, insert, update, delete on public.dashboards to authenticated;
grant select, insert, update, delete on public.dashboard_permisos to authenticated;
grant select on public.auditoria to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Las funciones de acceso solo las ejecutan usuarios autenticados (y el servidor).
revoke execute on function public.registrar(text, text, text, jsonb) from public, anon;
revoke execute on function public.buscar_usuario_por_email(text) from public, anon;
revoke execute on function public.perfiles_visibles(uuid[]) from public, anon;
grant execute on function public.registrar(text, text, text, jsonb) to authenticated;
grant execute on function public.buscar_usuario_por_email(text) to authenticated;
grant execute on function public.perfiles_visibles(uuid[]) to authenticated;

-- ---------------------------------------------------------------- Storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('excels', 'excels', false, 52428800, array[
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-excel',
  'application/octet-stream'
]) on conflict (id) do nothing;

-- Ruta: {workspace_id}/{dashboard_id}/{archivo}. El segundo segmento decide el acceso.
create function public.dashboard_de_ruta(p_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case when (storage.foldername(p_name))[2] ~ '^[0-9a-f-]{36}$'
              then ((storage.foldername(p_name))[2])::uuid end;
$$;

create policy "leer excel permitido" on storage.objects for select to authenticated
  using (bucket_id = 'excels' and public.puede_ver_dashboard(public.dashboard_de_ruta(name)));
create policy "subir excel editable" on storage.objects for insert to authenticated
  with check (bucket_id = 'excels' and public.puede_editar_dashboard(public.dashboard_de_ruta(name)));
create policy "reemplazar excel editable" on storage.objects for update to authenticated
  using (bucket_id = 'excels' and public.puede_editar_dashboard(public.dashboard_de_ruta(name)));
create policy "borrar excel propio" on storage.objects for delete to authenticated
  using (bucket_id = 'excels' and public.es_dueno_dashboard(public.dashboard_de_ruta(name)));
