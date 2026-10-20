import "server-only";
import { connection } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServidor } from "@/lib/supabase/servidor";
import type { PropsDashboard } from "@/components/Dashboard";
import type { Acceso, Dashboard, PerfilBasico, Perfil } from "@/lib/tipos";

type Nube = NonNullable<PropsDashboard["nube"]>;
const UNA_HORA = 60 * 60;

/** Dashboard que el usuario puede ver (RLS decide), con su nivel de acceso y una URL firmada del Excel. */
export async function cargarParaUsuario(id: string, yo: Perfil): Promise<Nube | null> {
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("dashboards").select("*").eq("id", id).maybeSingle();
  const d = data as Dashboard | null;
  if (!d) return null;

  let acceso: Acceso = "lector";
  if (d.owner_id === yo.id || yo.rol === "admin") acceso = "dueno";
  else {
    const { data: permiso } = await supabase.from("dashboard_permisos").select("nivel").eq("dashboard_id", id).eq("user_id", yo.id).maybeSingle();
    if (permiso?.nivel === "editor") acceso = "editor";
  }
  const { data: perfiles } = await supabase.rpc("perfiles_visibles", { p_ids: [d.owner_id] });
  const firmada = d.archivo_path ? await supabase.storage.from("excels").createSignedUrl(d.archivo_path, UNA_HORA) : null;
  return armar(d, acceso, (perfiles as PerfilBasico[] | null)?.[0] ?? null, firmada?.data?.signedUrl ?? null, {
    id: yo.id, nombre: yo.nombre, email: yo.email, rol: yo.rol,
  });
}

/** Vista pública por enlace: sin sesión. Se valida el token en el servidor con la clave de servicio, solo lectura. */
export async function cargarPublico(token: string): Promise<Nube | null> {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  await connection();
  const admin = supabaseAdmin();
  const { data } = await admin.from("dashboards").select("*").eq("enlace_publico", token).maybeSingle();
  const d = data as Dashboard | null;
  if (!d) return null;
  const { data: dueno } = await admin.from("profiles").select("id, nombre, email").eq("id", d.owner_id).maybeSingle();
  const firmada = d.archivo_path ? await admin.storage.from("excels").createSignedUrl(d.archivo_path, 10 * 60) : null;
  // En la vista pública no se expone el correo del dueño.
  return armar({ ...d, enlace_publico: null }, "lector", dueno ? { id: dueno.id, nombre: dueno.nombre, email: "" } : null, firmada?.data?.signedUrl ?? null, null);
}

function armar(d: Dashboard, acceso: Acceso, dueno: PerfilBasico | null, url: string | null, usuario: Nube["usuario"]): Nube {
  return {
    dashboard: { id: d.id, titulo: d.titulo, descripcion: d.descripcion, visibilidad: d.visibilidad, enlace: d.enlace_publico, dueno, acceso },
    usuario,
    config: d.config ?? {},
    fuente: url
      ? { url, meta: { nombre: d.archivo_nombre ?? "archivo.xlsx", tamano: d.archivo_tamano ?? 0, modificado: Date.parse(d.actualizado_en), origen: "nube" } }
      : null,
  };
}
