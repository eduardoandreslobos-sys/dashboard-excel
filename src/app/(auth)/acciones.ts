"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";

const correo = z.string().trim().toLowerCase().email("Escribe un correo válido.");
const clave = z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(72, "Máximo 72 caracteres.");

/** Solo rutas internas como destino tras ingresar (evita redirecciones abiertas). */
const destinoSeguro = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/dashboards";
};

async function origen() {
  const h = await headers();
  return h.get("origin") ?? `https://${h.get("host")}`;
}

/** Traduce los errores más comunes de Supabase Auth. */
function traducir(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("invalid login")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Confirma tu correo: te enviamos un enlace al registrarte.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Ya existe una cuenta con ese correo.";
  if (m.includes("banned")) return "Tu cuenta está suspendida. Contacta a un administrador.";
  if (m.includes("rate limit") || m.includes("too many")) return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
  if (m.includes("weak") || m.includes("password")) return "La contraseña es muy débil. Usa al menos 8 caracteres combinando letras y números.";
  return "No pudimos completar la operación. Inténtalo de nuevo.";
}

export async function ingresar(_: Resultado | null, form: FormData): Promise<Resultado> {
  const datos = z.object({ email: correo, clave: z.string().min(1, "Escribe tu contraseña.") }).safeParse({
    email: form.get("email"),
    clave: form.get("clave"),
  });
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message };
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.auth.signInWithPassword({ email: datos.data.email, password: datos.data.clave });
  if (error) return { ok: false, error: traducir(error.message) };
  await supabase.from("profiles").update({ ultimo_acceso: new Date().toISOString() }).eq("id", data.user.id);
  redirect(destinoSeguro(form.get("siguiente")));
}

export async function registrar(_: Resultado | null, form: FormData): Promise<Resultado> {
  const datos = z
    .object({
      nombre: z.string().trim().min(2, "Escribe tu nombre.").max(80),
      email: correo,
      clave,
      confirmar: z.string(),
    })
    .refine((d) => d.clave === d.confirmar, { message: "Las contraseñas no coinciden.", path: ["confirmar"] })
    .safeParse(Object.fromEntries(form));
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message };
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.auth.signUp({
    email: datos.data.email,
    password: datos.data.clave,
    options: { data: { nombre: datos.data.nombre }, emailRedirectTo: `${await origen()}/auth/confirmar` },
  });
  if (error) return { ok: false, error: traducir(error.message) };
  // Si el proyecto no exige confirmar el correo, la sesión ya está abierta.
  if (data.session) redirect("/dashboards");
  return { ok: true, mensaje: `Te enviamos un enlace de confirmación a ${datos.data.email}. Ábrelo para activar tu cuenta.` };
}

export async function recuperar(_: Resultado | null, form: FormData): Promise<Resultado> {
  const datos = correo.safeParse(form.get("email"));
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message };
  const supabase = await supabaseServidor();
  await supabase.auth.resetPasswordForEmail(datos.data, { redirectTo: `${await origen()}/auth/confirmar?siguiente=/nueva-clave` });
  // Mismo mensaje exista o no la cuenta, para no revelar qué correos están registrados.
  return { ok: true, mensaje: "Si existe una cuenta con ese correo, te enviamos un enlace para crear una nueva contraseña." };
}

export async function nuevaClave(_: Resultado | null, form: FormData): Promise<Resultado> {
  const datos = z
    .object({ clave, confirmar: z.string() })
    .refine((d) => d.clave === d.confirmar, { message: "Las contraseñas no coinciden." })
    .safeParse(Object.fromEntries(form));
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message };
  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.updateUser({ password: datos.data.clave });
  if (error) return { ok: false, error: traducir(error.message) };
  redirect("/dashboards?clave=actualizada");
}

export async function salir() {
  const supabase = await supabaseServidor();
  await supabase.auth.signOut();
  redirect("/ingresar");
}
