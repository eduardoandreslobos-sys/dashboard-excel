// Ejecuta la migración sobre un Postgres en memoria con esquemas auth/storage simulados
// y prueba la matriz de acceso (RLS) como cada tipo de usuario.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

import { readdirSync } from "node:fs";
const CARPETA = new URL("../migrations/", import.meta.url).pathname;
const MIGRACIONES = readdirSync(CARPETA).filter((f) => f.endsWith(".sql")).sort().map((f) => CARPETA + f);
const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
`);
await db.exec(`create role postgres_api nologin; grant service_role to postgres_api;`);
for (const m of MIGRACIONES) await db.exec(readFileSync(m, "utf8"));
console.log(`✓ ${MIGRACIONES.length} migraciones aplicadas sin errores`);

const U = {
  admin: "00000000-0000-4000-8000-000000000001",
  ana: "00000000-0000-4000-8000-000000000002",
  beto: "00000000-0000-4000-8000-000000000003",
  carla: "00000000-0000-4000-8000-000000000004",
};
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${U.admin}', 'EduardoAndresLobos@gmail.com', '{"nombre":"Eduardo"}'),
    ('${U.ana}', 'ana@x.cl', '{"nombre":"Ana"}'),
    ('${U.beto}', 'beto@x.cl', '{"nombre":"Beto"}'),
    ('${U.carla}', 'carla@x.cl', '{}');
`);

/** Ejecuta SQL como un usuario (o anónimo) dentro de una transacción con RLS. */
async function como(quien, sql) {
  const rol = quien ? "authenticated" : "anon";
  try {
    const r = await db.transaction(async (tx) => {
      await tx.exec(`select set_config('request.jwt.claim.sub', '${quien ? U[quien] : ""}', true); set local role ${rol};`);
      return tx.query(sql);
    });
    return { filas: r.rows, n: r.affectedRows ?? r.rows.length };
  } catch (e) {
    return { error: e.message };
  }
}

let fallos = 0;
function esperar(nombre, cond, detalle) {
  console.log(`${cond ? "✓" : "✗"} ${nombre}${cond ? "" : `  → ${JSON.stringify(detalle)}`}`);
  if (!cond) fallos++;
}

const perfil = (await db.query(`select id, rol, nombre from public.profiles order by email`)).rows;
esperar("Trigger crea 4 perfiles", perfil.length === 4, perfil);
esperar("El correo del primer admin queda como admin (sin importar mayúsculas)", perfil.find((p) => p.id === U.admin)?.rol === "admin", perfil);
esperar("Nombre por defecto desde el correo", perfil.find((p) => p.id === U.carla)?.nombre === "carla", perfil);
const ws = (await db.query(`select id, owner_id from public.workspaces`)).rows;
esperar("Cada usuario tiene su espacio personal", ws.length === 4, ws);
const wsAna = ws.find((w) => w.owner_id === U.ana).id;
const wsCarla = ws.find((w) => w.owner_id === U.carla).id;

const D1 = "11111111-1111-4111-8111-111111111111";
let r = await como("ana", `insert into public.dashboards (id, workspace_id, owner_id, titulo, archivo_path) values ('${D1}', '${wsAna}', '${U.ana}', 'Ventas', '${wsAna}/${D1}/a.xlsx')`);
esperar("Ana crea un dashboard en su espacio", !r.error, r);
r = await como("carla", `insert into public.dashboards (workspace_id, owner_id, titulo) values ('${wsAna}', '${U.carla}', 'Intruso')`);
esperar("Carla NO puede crear en el espacio de Ana", Boolean(r.error), r);
r = await como("carla", `insert into public.dashboards (workspace_id, owner_id, titulo) values ('${wsCarla}', '${U.ana}', 'Suplantación')`);
esperar("Carla NO puede crear a nombre de otra persona", Boolean(r.error), r);

r = await como("beto", `select id from public.dashboards where id = '${D1}'`);
esperar("Beto (sin permiso) NO ve el dashboard privado", r.filas?.length === 0, r);
r = await como(null, `select id from public.dashboards`);
esperar("Anónimo NO ve dashboards", r.filas?.length === 0 || Boolean(r.error), r);

r = await como("ana", `insert into public.dashboard_permisos (dashboard_id, user_id, nivel, otorgado_por) values ('${D1}', '${U.beto}', 'lector', '${U.ana}')`);
esperar("Ana comparte con Beto como lector", !r.error, r);
r = await como("carla", `insert into public.dashboard_permisos (dashboard_id, user_id, nivel, otorgado_por) values ('${D1}', '${U.carla}', 'editor', '${U.carla}')`);
esperar("Carla NO puede darse acceso a sí misma", Boolean(r.error), r);
r = await como("beto", `select id from public.dashboards where id = '${D1}'`);
esperar("Beto (lector) ve el dashboard", r.filas?.length === 1, r);
r = await como("beto", `update public.dashboards set config = '{"vista":"datos"}' where id = '${D1}'`);
esperar("Beto (lector) NO puede editar", r.n === 0 && !r.error, r);
r = await como("beto", `insert into storage.objects (bucket_id, name) values ('excels', '${wsAna}/${D1}/b.xlsx')`);
esperar("Beto (lector) NO puede subir archivos al dashboard", Boolean(r.error), r);
r = await como("beto", `insert into public.dashboard_permisos (dashboard_id, user_id, nivel, otorgado_por) values ('${D1}', '${U.carla}', 'lector', '${U.beto}')`);
esperar("Beto (lector) NO puede compartir con otros", Boolean(r.error), r);

r = await como("ana", `update public.dashboard_permisos set nivel = 'editor' where dashboard_id = '${D1}' and user_id = '${U.beto}'`);
esperar("Ana sube a Beto a editor", r.n === 1, r);
r = await como("beto", `update public.dashboards set config = '{"vista":"datos"}' where id = '${D1}'`);
esperar("Beto (editor) puede guardar la vista", r.n === 1, r);
r = await como("beto", `insert into storage.objects (bucket_id, name) values ('excels', '${wsAna}/${D1}/b.xlsx')`);
esperar("Beto (editor) puede subir un Excel nuevo", !r.error, r);
r = await como("beto", `update public.dashboards set visibilidad = 'plataforma' where id = '${D1}'`);
esperar("Beto (editor) NO puede publicar", Boolean(r.error), r);
r = await como("beto", `update public.dashboards set enlace_publico = 'tokentokentokentokentoken' where id = '${D1}'`);
esperar("Beto (editor) NO puede crear enlace público", Boolean(r.error), r);
r = await como("beto", `delete from public.dashboards where id = '${D1}'`);
esperar("Beto (editor) NO puede eliminar", r.n === 0 && !r.error, r);

r = await como("carla", `select id from public.dashboards where id = '${D1}'`);
esperar("Carla NO ve el dashboard aún", r.filas?.length === 0, r);
r = await como("ana", `update public.dashboards set visibilidad = 'plataforma' where id = '${D1}'`);
esperar("Ana publica en la plataforma", r.n === 1 && !r.error, r);
r = await como("carla", `select id from public.dashboards where id = '${D1}'`);
esperar("Carla ve el dashboard publicado", r.filas?.length === 1, r);
r = await como("carla", `select name from storage.objects where bucket_id = 'excels' and name like '${wsAna}/${D1}/%'`);
esperar("Carla puede leer el Excel del dashboard publicado", r.filas?.length === 1, r);
r = await como("carla", `update public.dashboards set titulo = 'hack' where id = '${D1}'`);
esperar("Carla NO puede editar un dashboard publicado", r.n === 0 && !r.error, r);
r = await como(null, `select id from public.dashboards where id = '${D1}'`);
esperar("Anónimo NO ve dashboards publicados en la plataforma", r.filas?.length === 0 || Boolean(r.error), r);

r = await como("carla", `select id from public.profiles`);
esperar("Carla solo ve su propio perfil", r.filas?.length === 1 && r.filas[0].id === U.carla, r);
r = await como("carla", `update public.profiles set rol = 'admin' where id = '${U.carla}'`);
esperar("Carla NO puede hacerse admin", Boolean(r.error), r);
r = await como("carla", `update public.profiles set nombre = 'Carla' where id = '${U.carla}'`);
esperar("Carla puede cambiar su nombre", r.n === 1 && !r.error, r);
r = await como("carla", `update public.profiles set nombre = 'x' where id = '${U.ana}'`);
esperar("Carla NO puede cambiar el perfil de Ana", r.n === 0 && !r.error, r);
r = await como("ana", `select * from public.buscar_usuario_por_email('BETO@x.cl')`);
esperar("Buscar por correo exacto encuentra a Beto", r.filas?.length === 1, r);
r = await como("ana", `select * from public.buscar_usuario_por_email('x.cl')`);
esperar("Buscar por fragmento NO lista usuarios", r.filas?.length === 0, r);
r = await como(null, `select * from public.buscar_usuario_por_email('beto@x.cl')`);
esperar("Anónimo NO puede buscar usuarios", Boolean(r.error) || r.filas?.length === 0, r);
r = await como("carla", `select id, nombre from public.perfiles_visibles(array['${U.ana}','${U.admin}']::uuid[])`);
esperar("Carla ve el nombre de Ana (dueña de algo publicado) pero no el del admin", r.filas?.length === 1 && r.filas[0].id === U.ana, r);

r = await como("admin", `select id from public.profiles`);
esperar("Admin ve todos los perfiles", r.filas?.length === 4, r);
r = await como("admin", `update public.profiles set rol = 'admin' where id = '${U.beto}'`);
esperar("Admin puede cambiar roles", r.n === 1 && !r.error, r);
r = await como("admin", `select accion from public.auditoria order by id`);
esperar("Admin ve la auditoría", (r.filas?.length ?? 0) >= 5, r);
console.log("   acciones auditadas:", r.filas?.map((f) => f.accion).join(", "));
r = await como("ana", `select accion from public.auditoria`);
esperar("Ana NO ve la auditoría", r.filas?.length === 0, r);
r = await como("ana", `insert into public.auditoria (accion, objetivo_tipo) values ('falso', 'x')`);
esperar("Nadie puede escribir la auditoría directamente", Boolean(r.error), r);
r = await como("ana", `select public.registrar('falso', 'x', null, '{}'::jsonb)`);
esperar("Nadie puede inventar entradas llamando a registrar()", Boolean(r.error), r);
r = await como(null, `select public.es_admin()`);
esperar("Anónimo NO puede invocar funciones internas", Boolean(r.error), r);
r = await como("ana", `select public.handle_new_user()`);
esperar("Nadie puede invocar los triggers por la API", Boolean(r.error), r);

await db.exec(`update public.profiles set estado = 'suspendido' where id = '${U.admin}'`);
r = await como("admin", `select id from public.profiles`);
esperar("Un admin suspendido pierde los privilegios de admin", r.filas?.length === 1, r);
await db.exec(`update public.profiles set estado = 'activo' where id = '${U.admin}'`);

r = await como("ana", `delete from public.dashboards where id = '${D1}'`);
esperar("Ana (dueña) puede eliminar", r.n === 1, r);
r = await como("beto", `select * from public.dashboard_permisos where dashboard_id = '${D1}'`);
esperar("Los permisos se borran en cascada", r.filas?.length === 0, r);

console.log(fallos ? `\n✗ ${fallos} prueba(s) fallaron` : "\n✓ Todas las pruebas de acceso pasaron");
process.exit(fallos ? 1 : 0);
