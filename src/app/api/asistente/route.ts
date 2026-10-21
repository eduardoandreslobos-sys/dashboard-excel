import { z } from "zod";
import { DEFINICIONES } from "@/lib/asistente/herramientas";
import { chatNvidia, chatNvidiaStream, ErrorNvidia } from "@/lib/servidor/nvidia";
import { usuarioActual } from "@/lib/servidor/sesion";

export const maxDuration = 60;

const REGLAS = `Eres el asistente de datos de "Dashboard Excel". Ayudas a entender la tabla que el usuario tiene abierta.
Reglas:
- Responde siempre en español de Chile, en 1 a 4 frases claras. Tus respuestas pueden leerse en voz alta: sin tablas, sin markdown, sin listas largas.
- Nunca inventes cifras. Para cualquier número usa las herramientas; si ninguna sirve, dilo.
- Escribe los números en formato chileno (punto para miles, coma para decimales: 3.264.653; 4,83 %). Para millones usa "3,26 millones".
- Usa los nombres exactos de columnas y valores que aparecen en la descripción de la tabla.
- Si el usuario pide ver, mostrar o filtrar algo, usa aplicar_filtro (o cambiar_vista/cambiar_medida) para que el dashboard cambie, y confírmalo en una frase.
- Los cálculos usan los filtros activos del dashboard; si hay filtros, menciónalo cuando importe.
- Si la pregunta no tiene que ver con los datos, responde brevemente y vuelve al tema de la tabla.`;

const mensaje = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.string().min(1).max(4000) }),
  z.object({
    role: z.literal("assistant"),
    content: z.string().max(8000).nullable().optional(),
    tool_calls: z
      .array(z.object({ id: z.string().max(100), type: z.literal("function"), function: z.object({ name: z.string().max(60), arguments: z.string().max(4000) }) }))
      .max(8)
      .optional(),
  }),
  z.object({ role: z.literal("tool"), tool_call_id: z.string().max(100), content: z.string().max(20000) }),
]);

const entrada = z.discriminatedUnion("modo", [
  z.object({ modo: z.literal("chat"), mensajes: z.array(mensaje).min(1).max(60), contexto: z.string().max(20000), think: z.boolean().default(false) }),
  z.object({ modo: z.literal("transcribir"), audio: z.string().min(100).max(4_000_000), pistas: z.string().max(1500).default("") }),
]);

const error = (mensaje: string, estado: number) => Response.json({ error: mensaje }, { status: estado });

export async function POST(request: Request) {
  // Tratado como endpoint público: se verifica la sesión en cada llamada.
  const yo = await usuarioActual();
  if (!yo) return error("Inicia sesión para usar el asistente.", 401);
  if (yo.estado !== "activo") return error("Tu cuenta está suspendida.", 403);

  const datos = entrada.safeParse(await request.json().catch(() => null));
  if (!datos.success) return error("Solicitud no válida.", 400);

  try {
    if (datos.data.modo === "transcribir") {
      const r = await chatNvidia(
        {
          messages: [{
            role: "user",
            content: [
              { type: "audio_url", audio_url: { url: `data:audio/wav;base64,${datos.data.audio}` } },
              {
                type: "text",
                text: `Transcribe exactamente lo que dice este audio, en español. Responde solo con la transcripción, sin comillas ni comentarios.${
                  datos.data.pistas ? ` Es una pregunta sobre una tabla de datos; palabras que pueden aparecer: ${datos.data.pistas}.` : ""
                }`,
              },
            ],
          }],
          temperature: 0,
          max_tokens: 300,
          chat_template_kwargs: { enable_thinking: false },
        },
        request.signal,
      );
      const json = await r.json();
      const texto = String(json.choices?.[0]?.message?.content ?? "").trim().replace(/^["«]|["»]$/g, "");
      if (!texto) return error("No logré entender el audio. Intenta hablar más cerca del micrófono.", 422);
      return Response.json({ texto });
    }

    const { mensajes, contexto, think } = datos.data;
    const flujo = await chatNvidiaStream(
      {
        messages: [{ role: "system", content: `${REGLAS}\n\nDescripción de la tabla:\n${contexto}` }, ...mensajes],
        tools: DEFINICIONES,
        tool_choice: "auto",
        temperature: 0.2,
        max_tokens: think ? 2048 : 700,
        chat_template_kwargs: { enable_thinking: think },
      },
      request.signal,
    );
    // Se reenvía el stream SSE tal cual (contenido, razonamiento y llamadas a herramientas).
    return new Response(flujo, {
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return error("Cancelado.", 499);
    if (e instanceof ErrorNvidia) return error(e.message, e.estado);
    console.error("asistente", e);
    return error("El asistente no pudo responder. Intenta de nuevo.", 500);
  }
}
