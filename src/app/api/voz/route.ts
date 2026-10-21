import { z } from "zod";
import { aWav, sintetizar } from "@/lib/servidor/riva";
import { usuarioActual } from "@/lib/servidor/sesion";

export const maxDuration = 30;

const entrada = z.object({ texto: z.string().trim().min(1).max(600) });

/** Texto → audio WAV con la voz Isabela (Magpie TTS de NVIDIA). El cliente pide una oración a la vez. */
export async function POST(request: Request) {
  const yo = await usuarioActual();
  if (!yo) return Response.json({ error: "Inicia sesión para usar la voz." }, { status: 401 });
  if (yo.estado !== "activo") return Response.json({ error: "Tu cuenta está suspendida." }, { status: 403 });
  const datos = entrada.safeParse(await request.json().catch(() => null));
  if (!datos.success) return Response.json({ error: "Texto no válido." }, { status: 400 });
  try {
    // Lectura en voz alta: los símbolos se pronuncian mejor escritos.
    const texto = datos.data.texto.replace(/%/g, " por ciento").replace(/\bUF\b/g, "U F").replace(/[*_#`]/g, "");
    const pcm = await sintetizar(texto, request.signal);
    return new Response(new Uint8Array(aWav(pcm)), { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("voz", e);
    return Response.json({ error: "No pude generar la voz en este momento." }, { status: 502 });
  }
}
