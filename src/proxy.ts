import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_CLAVE_PUBLICA, SUPABASE_URL, supabaseConfigurado } from "@/lib/supabase/entorno";

/** Rutas que requieren sesión. La verificación real está en la DAL (src/lib/servidor/sesion.ts). */
const PRIVADAS = ["/dashboards", "/d/", "/perfil", "/admin"];
const SOLO_INVITADOS = ["/ingresar", "/registro"];

/**
 * Refresca la cookie de sesión de Supabase en cada navegación y hace redirecciones optimistas.
 * No consulta la base de datos ni decide permisos (eso lo hacen la DAL y RLS).
 */
export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request });
  if (!supabaseConfigurado()) return respuesta;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_CLAVE_PUBLICA, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        lista.forEach(({ name, value }) => request.cookies.set(name, value));
        respuesta = NextResponse.next({ request });
        lista.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const conSesion = Boolean(data?.claims?.sub);
  const ruta = request.nextUrl.pathname;

  const redirigir = (destino: string) => {
    const url = request.nextUrl.clone();
    url.pathname = destino;
    url.search = destino === "/ingresar" ? `?siguiente=${encodeURIComponent(ruta)}` : "";
    const r = NextResponse.redirect(url);
    respuesta.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };
  if (!conSesion && PRIVADAS.some((p) => ruta.startsWith(p))) return redirigir("/ingresar");
  if (conSesion && SOLO_INVITADOS.some((p) => ruta.startsWith(p))) return redirigir("/dashboards");
  return respuesta;
}

export const config = {
  // Todas las rutas salvo archivos estáticos (las Server Actions también pasan por aquí).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|datos/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|xlsx)$).*)"],
};
