import { z } from "zod";
import { DEFINICIONES, DEFINICIONES_GRAFICOS, PIDE_VISUAL } from "@/lib/asistente/herramientas";
import { chatNvidia, chatNvidiaStream, ErrorNvidia } from "@/lib/servidor/nvidia";
import { usuarioActual } from "@/lib/servidor/sesion";

export const maxDuration = 60;

const REGLAS = `Eres el asistente de datos de "Dashboard Excel". Ayudas a entender la tabla que el usuario tiene abierta.
Reglas:
- Responde siempre en español de Chile, en 1 a 4 frases claras. Tus respuestas pueden leerse en voz alta: sin tablas, sin markdown, sin listas largas.
- Nunca inventes cifras. Para cualquier número usa las herramientas; si ninguna sirve, dilo.
- Escribe los números en formato chileno (punto para miles, coma para decimales: 3.264.653; 4,83 %). Para millones usa "3,26 millones".
- Usa los nombres exactos de columnas y valores que aparecen en la descripción de la tabla.
- Para saber cuántos registros cumplen algo (por estado, segmento, etc.) y qué porcentaje son, usa agregar_por_categoria sin medida sobre esa columna.
- Si el usuario pide un gráfico, una tabla, graficar o visualizar, usa grafico_barras, grafico_lineas, grafico_dispersion o tabla_datos (aparecen bajo tu respuesta y no cambian el dashboard). Llama una sola vez y comenta en 1 o 2 frases el hallazgo principal, sin repetir los datos en el texto.
- Si pide filtrar el dashboard o "muéstrame solo…", usa aplicar_filtro (o cambiar_vista/cambiar_medida) y confírmalo en una frase.
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
  z.object({
    modo: z.literal("chat"),
    mensajes: z.array(mensaje).min(1).max(60),
    contexto: z.string().max(20000),
    think: z.boolean().default(false),
    /** Vuelta dentro del turno: en la primera el modelo debe consultar los datos con una herramienta. */
    ronda: z.number().int().min(0).max(10).default(0),
    /** Pregunta por voz (WAV base64): el modelo la escucha directamente, sin esperar la transcripción. */
    audio: z.string().min(100).max(4_000_000).optional(),
    pistas: z.string().max(1500).default(""),
    porVoz: z.boolean().default(false),
  }),
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

    const { contexto, think, ronda, audio, pistas, porVoz } = datos.data;
    let mensajes: unknown[] = datos.data.mensajes;
    if (audio) {
      // La última pregunta del usuario va como audio: el modelo la escucha y consulta los datos en el mismo paso.
      const ultima = mensajes.findLastIndex((m) => (m as { role: string }).role === "user");
      mensajes = mensajes.map((m, i) =>
        i !== ultima ? m : {
          role: "user",
          content: [
            { type: "audio_url", audio_url: { url: `data:audio/wav;base64,${audio}` } },
            { type: "text", text: `La pregunta del usuario está en este audio, en español.${pistas ? ` Palabras que pueden aparecer: ${pistas}.` : ""}` },
          ],
        });
    }
    // Si la pregunta (escrita) pide un gráfico o una tabla, en la primera vuelta solo se ofrecen esas herramientas.
    const pregunta = datos.data.mensajes.findLast((m) => m.role === "user");
    const soloGraficos = ronda === 0 && !audio && pregunta?.role === "user" && PIDE_VISUAL.test(pregunta.content);
    const flujo = await chatNvidiaStream(
      {
        messages: [
          { role: "system", content: `${REGLAS}${porVoz ? "\n- Esta respuesta se escuchará en voz alta: una o dos frases cortas, sin paréntesis ni símbolos." : ""}\n\nDescripción de la tabla:\n${contexto}` },
          ...mensajes,
        ],
        tools: soloGraficos ? DEFINICIONES_GRAFICOS : DEFINICIONES,
        // En la primera vuelta es obligatorio consultar los datos: así el modelo no inventa cifras.
        tool_choice: ronda === 0 ? "required" : "auto",
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
