"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServidor } from "@/lib/supabase/servidor";
import type { ConfigDashboard, NivelPermiso, PerfilBasico, Resultado, Visibilidad } from "@/lib/tipos";
import { verificarSesion } from "./sesion";

/**
 * Server Actions de dashboards. Cada una se trata como un endpoint público:
 * verifica la sesión y usa el cliente del usuario, así que RLS decide qué se puede hacer.
 */

const id = z.string().uuid("Dashboard no válido.");
const titulo = z.string().trim().min(1, "Escribe un título.").max(120, "Máximo 120 caracteres.");
const BUCKET = "excels";

/** Nombre de archivo seguro para la ruta en Storage. */
function nombreSeguro(nombre: string) {
  const limpio = nombre.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^\w.-]+/g, "_").slice(-80);
  return `${Date.now()}-${limpio || "archivo.xlsx"}`;
}

const fallo = (error: string): Resultado<never> => ({ ok: false, error });

/** Crea el registro y devuelve la ruta donde el navegador debe subir el Excel. */
export async function crearDashboard(entrada: { titulo: string; archivoNombre: string; archivoTamano: number }): Promise<Resultado<{ id: string; path: string }>> {
  const yo = await verificarSesion();
  const datos = z.object({ titulo, archivoNombre: z.string().min(1).max(200), archivoTamano: z.number().int().min(1).max(52_428_800, "El archivo supera los 50 MB.") }).safeParse(entrada);
  if (!datos.success) return fallo(datos.error.issues[0].message);
  const supabase = await supabaseServidor();
  const { data: espacio } = await supabase.from("workspaces").select("id").eq("owner_id", yo.id).eq("personal", true).single();
  if (!espacio) return fallo("No encontré tu espacio de trabajo.");
  const nuevo = crypto.randomUUID();
  const path = `${espacio.id}/${nuevo}/${nombreSeguro(datos.data.archivoNombre)}`;
  const { error } = await supabase.from("dashboards").insert({
    id: nuevo,
    workspace_id: espacio.id,
    owner_id: yo.id,
    titulo: datos.data.titulo,
    archivo_path: path,
    archivo_nombre: datos.data.archivoNombre,
    archivo_tamano: datos.data.archivoTamano,
  });
  if (error) return fallo("No pude crear el dashboard.");
  return { ok: true, datos: { id: nuevo, path } };
}

export async function guardarVista(dashboardId: string, config: ConfigDashboard): Promise<Resultado> {
  await verificarSesion();
  if (!id.safeParse(dashboardId).success) return fallo("Dashboard no válido.");
  if (JSON.stringify(config).length > 100_000) return fallo("La vista es demasiado grande para guardarla.");
  const supabase = await supabaseServidor();
  const { error, count } = await supabase.from("dashboards").update({ config }, { count: "exact" }).eq("id", dashboardId);
  if (error || !count) return fallo("No tienes permiso para guardar cambios en este dashboard.");
  return { ok: true, mensaje: "Vista guardada" };
}

export async function renombrarDashboard(dashboardId: string, nuevoTitulo: string, descripcion = ""): Promise<Resultado> {
  await verificarSesion();
  const datos = z.object({ id, titulo, descripcion: z.string().max(500) }).safeParse({ id: dashboardId, titulo: nuevoTitulo, descripcion });
  if (!datos.success) return fallo(datos.error.issues[0].message);
  const supabase = await supabaseServidor();
  const { error, count } = await supabase.from("dashboards").update({ titulo: datos.data.titulo, descripcion: datos.data.descripcion }, { count: "exact" }).eq("id", dashboardId);
  if (error || !count) return fallo("No tienes permiso para editar este dashboard.");
  revalidatePath("/dashboards");
  return { ok: true, mensaje: "Cambios guardados" };
}

/** Paso 1 del reemplazo: ruta nueva para subir el archivo (el anterior se borra al confirmar). */
export async function prepararReemplazo(dashboardId: string, archivoNombre: string): Promise<Resultado<{ path: string }>> {
  await verificarSesion();
  if (!id.safeParse(dashboardId).success) return fallo("Dashboard no válido.");
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("dashboards").select("workspace_id").eq("id", dashboardId).single();
  if (!data) return fallo("No encontré el dashboard.");
  return { ok: true, datos: { path: `${data.workspace_id}/${dashboardId}/${nombreSeguro(archivoNombre)}` } };
}

/** Paso 2 del reemplazo: apunta el dashboard al archivo nuevo y borra el anterior. */
export async function confirmarReemplazo(dashboardId: string, path: string, archivoNombre: string, archivoTamano: number): Promise<Resultado> {
  await verificarSesion();
  if (!id.safeParse(dashboardId).success || !path.includes(`/${dashboardId}/`)) return fallo("Ruta no válida.");
  const supabase = await supabaseServidor();
  const { data: actual } = await supabase.from("dashboards").select("archivo_path").eq("id", dashboardId).single();
  const { error, count } = await supabase
    .from("dashboards")
    .update({ archivo_path: path, archivo_nombre: archivoNombre, archivo_tamano: archivoTamano }, { count: "exact" })
    .eq("id", dashboardId);
  if (error || !count) return fallo("No tienes permiso para reemplazar el archivo.");
  if (actual?.archivo_path && actual.archivo_path !== path) await supabase.storage.from(BUCKET).remove([actual.archivo_path]);
  return { ok: true, mensaje: "Excel reemplazado" };
}

export async function eliminarDashboard(dashboardId: string): Promise<Resultado> {
  await verificarSesion();
  if (!id.safeParse(dashboardId).success) return fallo("Dashboard no válido.");
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("dashboards").select("workspace_id").eq("id", dashboardId).single();
  if (!data) return fallo("No encontré el dashboard.");
  const carpeta = `${data.workspace_id}/${dashboardId}`;
  const { data: archivos } = await supabase.storage.from(BUCKET).list(carpeta);
  const { error, count } = await supabase.from("dashboards").delete({ count: "exact" }).eq("id", dashboardId);
  if (error || !count) return fallo("Solo el dueño puede eliminar este dashboard.");
  if (archivos?.length) await supabase.storage.from(BUCKET).remove(archivos.map((a) => `${carpeta}/${a.name}`));
  revalidatePath("/dashboards");
  return { ok: true, mensaje: "Dashboard eliminado" };
}

/** Copia un dashboard que puedo ver (con su Excel y su vista) a mi espacio. */
export async function duplicarDashboard(dashboardId: string): Promise<Resultado<{ id: string }>> {
  const yo = await verificarSesion();
  if (!id.safeParse(dashboardId).success) return fallo("Dashboard no válido.");
  const supabase = await supabaseServidor();
  const { data: origen } = await supabase.from("dashboards").select("*").eq("id", dashboardId).single();
  const { data: espacio } = await supabase.from("workspaces").select("id").eq("owner_id", yo.id).eq("personal", true).single();
  if (!origen || !espacio) return fallo("No pude duplicar este dashboard.");
  const nuevo = crypto.randomUUID();
  const path = origen.archivo_nombre ? `${espacio.id}/${nuevo}/${nombreSeguro(origen.archivo_nombre)}` : null;
  const { error } = await supabase.from("dashboards").insert({
    id: nuevo,
    workspace_id: espacio.id,
    owner_id: yo.id,
    titulo: `${origen.titulo} (copia)`.slice(0, 120),
    descripcion: origen.descripcion,
    config: origen.config,
    archivo_path: path,
    archivo_nombre: origen.archivo_nombre,
    archivo_tamano: origen.archivo_tamano,
  });
  if (error) return fallo("No pude duplicar este dashboard.");
  if (origen.archivo_path && path) {
    const { error: e2 } = await supabase.storage.from(BUCKET).copy(origen.archivo_path, path);
    if (e2) {
      await supabase.from("dashboards").delete().eq("id", nuevo);
      return fallo("No pude copiar el Excel del dashboard.");
    }
  }
  revalidatePath("/dashboards");
  return { ok: true, datos: { id: nuevo }, mensaje: "Copia creada en tu espacio" };
}

// ---------------------------------------------------------------- compartir y publicar

export interface Acceso {
  usuario: PerfilBasico;
  nivel: NivelPermiso;
}

export async function listarAccesos(dashboardId: string): Promise<Resultado<{ accesos: Acceso[]; visibilidad: Visibilidad; enlace: string | null }>> {
  await verificarSesion();
  if (!id.safeParse(dashboardId).success) return fallo("Dashboard no válido.");
  const supabase = await supabaseServidor();
  const { data: d } = await supabase.from("dashboards").select("visibilidad, enlace_publico").eq("id", dashboardId).single();
  if (!d) return fallo("No encontré el dashboard.");
  const { data: permisos } = await supabase.from("dashboard_permisos").select("user_id, nivel").eq("dashboard_id", dashboardId).order("creado_en");
  const ids = (permisos ?? []).map((p) => p.user_id);
  const { data: perfiles } = ids.length ? await supabase.rpc("perfiles_visibles", { p_ids: ids }) : { data: [] };
  const porId = new Map((perfiles as PerfilBasico[] | null ?? []).map((p) => [p.id, p]));
  return {
    ok: true,
    datos: {
      visibilidad: d.visibilidad,
      enlace: d.enlace_publico,
      accesos: (permisos ?? []).map((p) => ({ nivel: p.nivel, usuario: porId.get(p.user_id) ?? { id: p.user_id, nombre: "Usuario", email: "" } })),
    },
  };
}

export async function compartir(dashboardId: string, email: string, nivel: NivelPermiso): Promise<Resultado> {
  const yo = await verificarSesion();
  const datos = z.object({ id, email: z.string().trim().email("Escribe un correo válido."), nivel: z.enum(["lector", "editor"]) }).safeParse({ id: dashboardId, email, nivel });
  if (!datos.success) return fallo(datos.error.issues[0].message);
  if (datos.data.email.toLowerCase() === yo.email.toLowerCase()) return fallo("Ya eres el dueño de este dashboard.");
  const supabase = await supabaseServidor();
  const { data: encontrados } = await supabase.rpc("buscar_usuario_por_email", { p_email: datos.data.email });
  const persona = (encontrados as PerfilBasico[] | null)?.[0];
  if (!persona) return fallo("No hay ninguna cuenta con ese correo. Pídele que se registre primero.");
  const { error } = await supabase
    .from("dashboard_permisos")
    .upsert({ dashboard_id: dashboardId, user_id: persona.id, nivel: datos.data.nivel, otorgado_por: yo.id });
  if (error) return fallo("Solo el dueño puede compartir este dashboard.");
  return { ok: true, mensaje: `Compartido con ${persona.nombre || persona.email}` };
}

export async function quitarAcceso(dashboardId: string, userId: string): Promise<Resultado> {
  await verificarSesion();
  if (!id.safeParse(dashboardId).success || !id.safeParse(userId).success) return fallo("Datos no válidos.");
  const supabase = await supabaseServidor();
  const { error, count } = await supabase.from("dashboard_permisos").delete({ count: "exact" }).eq("dashboard_id", dashboardId).eq("user_id", userId);
  if (error || !count) return fallo("No pude quitar el acceso.");
  return { ok: true, mensaje: "Acceso quitado" };
}

export async function cambiarVisibilidad(dashboardId: string, visibilidad: Visibilidad): Promise<Resultado> {
  await verificarSesion();
  if (!id.safeParse(dashboardId).success || !["privado", "plataforma"].includes(visibilidad)) return fallo("Datos no válidos.");
  const supabase = await supabaseServidor();
  const { error, count } = await supabase.from("dashboards").update({ visibilidad }, { count: "exact" }).eq("id", dashboardId);
  if (error || !count) return fallo("Solo el dueño puede publicar este dashboard.");
  revalidatePath("/dashboards");
  return { ok: true, mensaje: visibilidad === "plataforma" ? "Publicado en la plataforma" : "Ahora es privado" };
}

/** Crea (o renueva) el enlace público: un token aleatorio largo, imposible de adivinar. */
export async function crearEnlacePublico(dashboardId: string): Promise<Resultado<{ token: string }>> {
  await verificarSesion();
  if (!id.safeParse(dashboardId).success) return fallo("Dashboard no válido.");
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
  const supabase = await supabaseServidor();
  const { error, count } = await supabase.from("dashboards").update({ enlace_publico: token }, { count: "exact" }).eq("id", dashboardId);
  if (error || !count) return fallo("Solo el dueño puede crear un enlace público.");
  return { ok: true, datos: { token }, mensaje: "Enlace público creado" };
}

export async function revocarEnlacePublico(dashboardId: string): Promise<Resultado> {
  await verificarSesion();
  if (!id.safeParse(dashboardId).success) return fallo("Dashboard no válido.");
  const supabase = await supabaseServidor();
  const { error, count } = await supabase.from("dashboards").update({ enlace_publico: null }, { count: "exact" }).eq("id", dashboardId);
  if (error || !count) return fallo("Solo el dueño puede revocar el enlace.");
  return { ok: true, mensaje: "Enlace revocado: ya no funciona" };
}
