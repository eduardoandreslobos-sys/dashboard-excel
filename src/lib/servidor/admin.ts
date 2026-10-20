"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServidor } from "@/lib/supabase/servidor";
import type { Resultado, RolPlataforma } from "@/lib/tipos";
import { usuarioActual } from "./sesion";

/** Acciones de administración: cada una verifica en el servidor que quien llama es admin activo. */
async function exigirAdmin() {
  const yo = await usuarioActual();
  if (!yo || yo.rol !== "admin" || yo.estado !== "activo") throw new Error("Solo un administrador puede hacer esto.");
  return yo;
}

const uuid = z.string().uuid();
const fallo = (error: string): Resultado => ({ ok: false, error });

export async function cambiarRol(userId: string, rol: RolPlataforma): Promise<Resultado> {
  const yo = await exigirAdmin();
  if (!uuid.safeParse(userId).success || !["admin", "miembro"].includes(rol)) return fallo("Datos no válidos.");
  if (userId === yo.id && rol !== "admin") return fallo("No puedes quitarte el rol de administrador a ti mismo.");
  const supabase = await supabaseServidor();
  const { error, count } = await supabase.from("profiles").update({ rol }, { count: "exact" }).eq("id", userId);
  if (error || !count) return fallo("No pude cambiar el rol.");
  revalidatePath("/admin");
  return { ok: true, mensaje: rol === "admin" ? "Ahora es administrador" : "Ahora es miembro" };
}

/** Suspender bloquea el ingreso (ban en Auth) y marca el perfil; reactivar lo revierte. */
export async function cambiarEstado(userId: string, suspender: boolean): Promise<Resultado> {
  const yo = await exigirAdmin();
  if (!uuid.safeParse(userId).success) return fallo("Usuario no válido.");
  if (userId === yo.id) return fallo("No puedes suspender tu propia cuenta.");
  const admin = supabaseAdmin();
  const { error: e1 } = await admin.auth.admin.updateUserById(userId, { ban_duration: suspender ? "876000h" : "none" });
  if (e1) return fallo("No pude actualizar la cuenta en Auth.");
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("profiles").update({ estado: suspender ? "suspendido" : "activo" }).eq("id", userId);
  if (error) return fallo("No pude actualizar el estado.");
  revalidatePath("/admin");
  return { ok: true, mensaje: suspender ? "Cuenta suspendida: ya no puede ingresar" : "Cuenta reactivada" };
}

/** Elimina la cuenta, sus dashboards (en cascada) y sus archivos en Storage. */
export async function eliminarUsuario(userId: string): Promise<Resultado> {
  const yo = await exigirAdmin();
  if (!uuid.safeParse(userId).success) return fallo("Usuario no válido.");
  if (userId === yo.id) return fallo("No puedes eliminar tu propia cuenta desde aquí.");
  const admin = supabaseAdmin();
  const { data: perfil } = await admin.from("profiles").select("email").eq("id", userId).maybeSingle();
  const { data: espacios } = await admin.from("workspaces").select("id").eq("owner_id", userId);
  for (const ws of espacios ?? []) {
    const { data: carpetas } = await admin.storage.from("excels").list(ws.id);
    for (const c of carpetas ?? []) {
      const { data: archivos } = await admin.storage.from("excels").list(`${ws.id}/${c.name}`);
      if (archivos?.length) await admin.storage.from("excels").remove(archivos.map((a) => `${ws.id}/${c.name}/${a.name}`));
    }
  }
  // La auditoría solo la escribe el servidor: queda registrado quién eliminó la cuenta.
  await admin.from("auditoria").insert({ actor_id: yo.id, accion: "usuario.eliminar", objetivo_tipo: "usuario", objetivo_id: userId, detalle: { email: perfil?.email ?? "" } });
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return fallo("No pude eliminar la cuenta.");
  revalidatePath("/admin");
  return { ok: true, mensaje: "Cuenta eliminada" };
}

/** Moderación: deja privado un dashboard publicado y revoca su enlace público. */
export async function quitarPublicacion(dashboardId: string): Promise<Resultado> {
  await exigirAdmin();
  if (!uuid.safeParse(dashboardId).success) return fallo("Dashboard no válido.");
  const supabase = await supabaseServidor();
  const { error, count } = await supabase.from("dashboards").update({ visibilidad: "privado", enlace_publico: null }, { count: "exact" }).eq("id", dashboardId);
  if (error || !count) return fallo("No pude quitar la publicación.");
  revalidatePath("/admin");
  return { ok: true, mensaje: "Publicación retirada" };
}
