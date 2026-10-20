import "server-only";
import { supabaseServidor } from "@/lib/supabase/servidor";
import type { Acceso, Dashboard, NivelPermiso, Perfil, PerfilBasico } from "@/lib/tipos";

export interface Tarjeta {
  id: string;
  titulo: string;
  descripcion: string;
  publicado: boolean;
  enlacePublico: boolean;
  archivo: string | null;
  tamano: number | null;
  actualizado: string;
  dueno: PerfilBasico | null;
  acceso: Acceso;
  compartidoCon: number;
}

export interface Espacio {
  mios: Tarjeta[];
  compartidos: Tarjeta[];
  publicados: Tarjeta[];
}

const CAMPOS = "id, owner_id, titulo, descripcion, visibilidad, enlace_publico, archivo_nombre, archivo_tamano, actualizado_en";
type Fila = Pick<Dashboard, "id" | "owner_id" | "titulo" | "descripcion" | "visibilidad" | "enlace_publico" | "archivo_nombre" | "archivo_tamano" | "actualizado_en">;

/** Los tres listados de Mi espacio, con RLS del usuario. */
export async function cargarEspacio(yo: Perfil): Promise<Espacio> {
  const supabase = await supabaseServidor();
  const [mios, permisos, publicos] = await Promise.all([
    supabase.from("dashboards").select(CAMPOS).eq("owner_id", yo.id).order("actualizado_en", { ascending: false }),
    supabase.from("dashboard_permisos").select("dashboard_id, nivel").eq("user_id", yo.id),
    supabase.from("dashboards").select(CAMPOS).eq("visibilidad", "plataforma").neq("owner_id", yo.id).order("actualizado_en", { ascending: false }).limit(200),
  ]);
  const nivelPor = new Map((permisos.data ?? []).map((p) => [p.dashboard_id as string, p.nivel as NivelPermiso]));
  const compartidos = nivelPor.size
    ? (await supabase.from("dashboards").select(CAMPOS).in("id", [...nivelPor.keys()]).order("actualizado_en", { ascending: false })).data ?? []
    : [];
  const misIds = (mios.data ?? []).map((d) => d.id);
  const conteo = new Map<string, number>();
  if (misIds.length) {
    const { data } = await supabase.from("dashboard_permisos").select("dashboard_id").in("dashboard_id", misIds);
    (data ?? []).forEach((p) => conteo.set(p.dashboard_id, (conteo.get(p.dashboard_id) ?? 0) + 1));
  }
  const duenos = [...new Set([...compartidos, ...(publicos.data ?? [])].map((d) => d.owner_id))];
  const { data: perfiles } = duenos.length ? await supabase.rpc("perfiles_visibles", { p_ids: duenos }) : { data: [] };
  const perfilPor = new Map(((perfiles as PerfilBasico[] | null) ?? []).map((p) => [p.id, p]));
  const yoBasico: PerfilBasico = { id: yo.id, nombre: yo.nombre, email: yo.email };

  const tarjeta = (d: Fila, acceso: Acceso): Tarjeta => ({
    id: d.id,
    titulo: d.titulo,
    descripcion: d.descripcion,
    publicado: d.visibilidad === "plataforma",
    enlacePublico: Boolean(d.enlace_publico),
    archivo: d.archivo_nombre,
    tamano: d.archivo_tamano,
    actualizado: d.actualizado_en,
    dueno: d.owner_id === yo.id ? yoBasico : perfilPor.get(d.owner_id) ?? null,
    acceso,
    compartidoCon: conteo.get(d.id) ?? 0,
  });
  const yaCompartidos = new Set(nivelPor.keys());
  return {
    mios: (mios.data ?? []).map((d) => tarjeta(d as Fila, "dueno")),
    compartidos: (compartidos as Fila[]).map((d) => tarjeta(d, nivelPor.get(d.id) === "editor" ? "editor" : "lector")),
    publicados: ((publicos.data ?? []) as Fila[]).filter((d) => !yaCompartidos.has(d.id)).map((d) => tarjeta(d, "lector")),
  };
}
