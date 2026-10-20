import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/servidor";
import type { Perfil } from "@/lib/tipos";

/**
 * Capa de acceso a datos para la sesión (recomendada por la guía de autenticación de Next 16):
 * se verifica aquí, cerca de los datos, y no en layouts ni en el proxy.
 * `getUser()` valida el token contra Supabase Auth en cada petición.
 */
export const usuarioActual = cache(async (): Promise<Perfil | null> => {
  const supabase = await supabaseServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: perfil } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
  return (perfil as Perfil | null) ?? null;
});

/** Exige sesión activa; si no hay, redirige a ingresar. Devuelve el perfil del usuario. */
export async function verificarSesion(siguiente?: string): Promise<Perfil> {
  const perfil = await usuarioActual();
  if (!perfil) redirect(siguiente ? `/ingresar?siguiente=${encodeURIComponent(siguiente)}` : "/ingresar");
  if (perfil.estado === "suspendido") redirect("/ingresar?suspendido=1");
  return perfil;
}

/** Exige rol administrador. */
export async function verificarAdmin(): Promise<Perfil> {
  const perfil = await verificarSesion("/admin");
  if (perfil.rol !== "admin") redirect("/dashboards");
  return perfil;
}
