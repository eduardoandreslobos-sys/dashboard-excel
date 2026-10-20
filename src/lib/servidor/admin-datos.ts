import "server-only";
import { supabaseServidor } from "@/lib/supabase/servidor";
import type { Perfil } from "@/lib/tipos";

export interface FilaUsuario extends Perfil {
  dashboards: number;
}
export interface FilaDashboardAdmin {
  id: string;
  titulo: string;
  dueno: string;
  publicado: boolean;
  enlace: boolean;
  compartidoCon: number;
  actualizado: string;
}
export interface FilaActividad {
  id: number;
  actor: string;
  accion: string;
  objetivo: string;
  detalle: Record<string, unknown>;
  creado: string;
}
export interface DatosAdmin {
  usuarios: FilaUsuario[];
  dashboards: FilaDashboardAdmin[];
  actividad: FilaActividad[];
}

/** Todo lo que ve el panel. RLS permite estas lecturas solo a administradores. */
export async function cargarAdmin(): Promise<DatosAdmin> {
  const supabase = await supabaseServidor();
  const [perfiles, dashboards, permisos, auditoria] = await Promise.all([
    supabase.from("profiles").select("*").order("creado_en", { ascending: false }),
    supabase.from("dashboards").select("id, titulo, owner_id, visibilidad, enlace_publico, actualizado_en").order("actualizado_en", { ascending: false }),
    supabase.from("dashboard_permisos").select("dashboard_id"),
    supabase.from("auditoria").select("*").order("creado_en", { ascending: false }).limit(300),
  ]);
  const listaPerfiles = (perfiles.data ?? []) as Perfil[];
  const nombre = new Map(listaPerfiles.map((p) => [p.id, p.nombre || p.email]));
  const porDueno = new Map<string, number>();
  (dashboards.data ?? []).forEach((d) => porDueno.set(d.owner_id, (porDueno.get(d.owner_id) ?? 0) + 1));
  const compartidos = new Map<string, number>();
  (permisos.data ?? []).forEach((p) => compartidos.set(p.dashboard_id, (compartidos.get(p.dashboard_id) ?? 0) + 1));
  const tituloDash = new Map((dashboards.data ?? []).map((d) => [d.id, d.titulo]));
  return {
    usuarios: listaPerfiles.map((p) => ({ ...p, dashboards: porDueno.get(p.id) ?? 0 })),
    dashboards: (dashboards.data ?? []).map((d) => ({
      id: d.id,
      titulo: d.titulo,
      dueno: nombre.get(d.owner_id) ?? "—",
      publicado: d.visibilidad === "plataforma",
      enlace: Boolean(d.enlace_publico),
      compartidoCon: compartidos.get(d.id) ?? 0,
      actualizado: d.actualizado_en,
    })),
    actividad: (auditoria.data ?? []).map((a) => ({
      id: a.id,
      actor: a.actor_id ? nombre.get(a.actor_id) ?? "Usuario eliminado" : "Sistema",
      accion: a.accion,
      objetivo:
        a.objetivo_tipo === "dashboard"
          ? tituloDash.get(a.objetivo_id) ?? String((a.detalle as { titulo?: string })?.titulo ?? "Dashboard eliminado")
          : nombre.get(a.objetivo_id) ?? String((a.detalle as { email?: string })?.email ?? a.objetivo_id ?? ""),
      detalle: (a.detalle ?? {}) as Record<string, unknown>,
      creado: a.creado_en,
    })),
  };
}
