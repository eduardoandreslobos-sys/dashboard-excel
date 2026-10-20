import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_CLAVE_PUBLICA, SUPABASE_URL } from "./entorno";

/** Cliente por petición con la sesión del usuario (RLS aplica). Crear uno nuevo en cada render o acción. */
export async function supabaseServidor() {
  const almacen = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_CLAVE_PUBLICA, {
    cookies: {
      getAll: () => almacen.getAll(),
      setAll: (lista) => {
        try {
          lista.forEach(({ name, value, options }) => almacen.set(name, value, options));
        } catch {
          // En un Server Component no se pueden escribir cookies: el proxy ya refrescó la sesión.
        }
      },
    },
  });
}
