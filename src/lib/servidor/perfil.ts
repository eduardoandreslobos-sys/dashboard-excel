"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { verificarSesion } from "./sesion";

export async function actualizarPerfil(_: Resultado | null, form: FormData): Promise<Resultado> {
  const yo = await verificarSesion();
  const nombre = z.string().trim().min(2, "Escribe tu nombre.").max(80).safeParse(form.get("nombre"));
  if (!nombre.success) return { ok: false, error: nombre.error.issues[0].message };
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("profiles").update({ nombre: nombre.data }).eq("id", yo.id);
  if (error) return { ok: false, error: "No pude guardar tu nombre." };
  revalidatePath("/perfil");
  return { ok: true, mensaje: "Perfil actualizado" };
}

export async function cambiarClave(_: Resultado | null, form: FormData): Promise<Resultado> {
  const yo = await verificarSesion();
  const datos = z
    .object({ actual: z.string().min(1, "Escribe tu contraseña actual."), clave: z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres.").max(72), confirmar: z.string() })
    .refine((d) => d.clave === d.confirmar, { message: "Las contraseñas no coinciden." })
    .safeParse(Object.fromEntries(form));
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message };
  const supabase = await supabaseServidor();
  // Confirma la contraseña actual antes de cambiarla.
  const { error: e1 } = await supabase.auth.signInWithPassword({ email: yo.email, password: datos.data.actual });
  if (e1) return { ok: false, error: "La contraseña actual no es correcta." };
  const { error } = await supabase.auth.updateUser({ password: datos.data.clave });
  if (error) return { ok: false, error: "No pude cambiar la contraseña. Prueba con una más segura." };
  return { ok: true, mensaje: "Contraseña actualizada" };
}
