"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_CLAVE_PUBLICA, SUPABASE_URL } from "./entorno";

let cliente: ReturnType<typeof createBrowserClient> | null = null;

/** Cliente del navegador (subidas a Storage, descarga de archivos). Respeta RLS con la sesión del usuario. */
export function supabaseNavegador() {
  cliente ??= createBrowserClient(SUPABASE_URL, SUPABASE_CLAVE_PUBLICA);
  return cliente;
}
