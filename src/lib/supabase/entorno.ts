/**
 * Variables que inyecta la integración Supabase de Vercel.
 * Se aceptan los nombres nuevos (publishable/secret) y los clásicos (anon/service_role).
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_CLAVE_PUBLICA =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseConfigurado = () => Boolean(SUPABASE_URL && SUPABASE_CLAVE_PUBLICA);
