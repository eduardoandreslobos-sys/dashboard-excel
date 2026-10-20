import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./entorno";

/**
 * Cliente con clave de servicio: salta RLS. Solo para el servidor y SIEMPRE después de
 * verificar que quien llama es admin (o para el enlace público, en modo solo lectura).
 */
export function supabaseAdmin() {
  const clave = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!clave) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  return createClient(SUPABASE_URL, clave, { auth: { persistSession: false, autoRefreshToken: false } });
}
