import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServidor } from "@/lib/supabase/servidor";

/** Canjea el enlace del correo (confirmación de cuenta o recuperación de contraseña) por una sesión. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") as EmailOtpType | null;
  const codigo = searchParams.get("code");
  const sig = searchParams.get("siguiente") ?? "/dashboards";
  const siguiente = sig.startsWith("/") && !sig.startsWith("//") ? sig : "/dashboards";

  const supabase = await supabaseServidor();
  const { error } = tokenHash && tipo
    ? await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash })
    : codigo
      ? await supabase.auth.exchangeCodeForSession(codigo)
      : { error: new Error("Enlace incompleto") };
  if (error) return NextResponse.redirect(`${origin}/ingresar?enlace=invalido`);
  return NextResponse.redirect(`${origin}${tipo === "recovery" ? "/nueva-clave" : siguiente}`);
}
