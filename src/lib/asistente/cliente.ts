"use client";

/** Ciclo del asistente en el navegador: llama a /api/asistente, ejecuta herramientas localmente y repite. */

export type Mensaje =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: LlamadaHerramienta[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface LlamadaHerramienta {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface Eventos {
  /** Texto de la respuesta (acumulado) y la vuelta en que llegó (la 0 nunca es la final). */
  onTexto: (texto: string, ronda: number) => void;
  /** Empieza una herramienta: devuelve su resultado (ya ejecutado). */
  onHerramienta: (nombre: string, args: Record<string, unknown>) => unknown;
  /** El modelo está razonando (modo Think). */
  onRazonando?: () => void;
}

const MAX_RONDAS = 5;

async function leerError(r: Response): Promise<string> {
  try {
    return (await r.json()).error ?? "El asistente no pudo responder.";
  } catch {
    return "El asistente no pudo responder.";
  }
}

/** Lee el stream SSE de una ronda: devuelve el texto y las llamadas a herramientas pedidas. */
async function leerRonda(r: Response, ev: Eventos, ronda: number): Promise<{ texto: string; llamadas: LlamadaHerramienta[] }> {
  const lector = r.body!.getReader();
  const decodificador = new TextDecoder();
  let buffer = "";
  let texto = "";
  const llamadas: LlamadaHerramienta[] = [];
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    buffer += decodificador.decode(value, { stream: true });
    const lineas = buffer.split("\n");
    buffer = lineas.pop() ?? "";
    for (const linea of lineas) {
      const l = linea.trim();
      if (!l.startsWith("data:")) continue;
      const dato = l.slice(5).trim();
      if (dato === "[DONE]") continue;
      let json;
      try {
        json = JSON.parse(dato);
      } catch {
        continue;
      }
      if (json.error) {
        const saturado = /ResourceExhausted|limit/i.test(String(json.error.message ?? ""));
        throw new Error(saturado ? "El asistente gratuito está saturado en este momento. Intenta de nuevo en unos segundos." : "El asistente no pudo responder. Intenta de nuevo.");
      }
      const delta = json.choices?.[0]?.delta ?? {};
      if (delta.reasoning_content || delta.reasoning) ev.onRazonando?.();
      if (delta.content) {
        texto += delta.content;
        ev.onTexto(texto, ronda);
      }
      for (const tc of delta.tool_calls ?? []) {
        const i = tc.index ?? 0;
        llamadas[i] ??= { id: tc.id ?? `llamada-${i}`, type: "function", function: { name: "", arguments: "" } };
        if (tc.id) llamadas[i].id = tc.id;
        if (tc.function?.name) llamadas[i].function.name += tc.function.name;
        if (tc.function?.arguments) llamadas[i].function.arguments += tc.function.arguments;
      }
    }
  }
  return { texto, llamadas: llamadas.filter(Boolean) };
}

/**
 * Corre un turno completo. Devuelve el historial actualizado (con las herramientas usadas)
 * y el texto final. Lanza Error con un mensaje en español si algo falla.
 */
export interface OpcionesVoz {
  /** Audio WAV (base64) de la pregunta: se envía mientras no llegue la transcripción. */
  audio: string;
  pistas: string;
  /** Se completa en paralelo; cuando llega, reemplaza al audio en el historial. */
  transcripcion: { texto: string | null };
}

export async function correrTurno(
  historial: Mensaje[],
  contexto: string,
  think: boolean,
  ev: Eventos,
  senal: AbortSignal,
  voz?: OpcionesVoz,
): Promise<{ historial: Mensaje[]; respuesta: string }> {
  const mensajes = [...historial];
  const indicePregunta = mensajes.length - 1;
  for (let ronda = 0; ronda < MAX_RONDAS; ronda++) {
    const conTexto = voz?.transcripcion.texto;
    if (conTexto) mensajes[indicePregunta] = { role: "user", content: conTexto };
    const r = await fetch("/api/asistente", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modo: "chat", mensajes, contexto, think, ronda,
        ...(voz ? { porVoz: true, pistas: voz.pistas, ...(conTexto ? {} : { audio: voz.audio }) } : {}),
      }),
      signal: senal,
    });
    if (!r.ok) throw new Error(await leerError(r));
    const { texto, llamadas } = await leerRonda(r, ev, ronda);
    // Algunos modelos dejan el razonamiento en <think>…</think> dentro del contenido.
    const limpio = texto.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (!llamadas.length) {
      mensajes.push({ role: "assistant", content: limpio });
      return { historial: mensajes, respuesta: limpio };
    }
    mensajes.push({ role: "assistant", content: limpio || null, tool_calls: llamadas });
    for (const llamada of llamadas) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(llamada.function.arguments || "{}");
      } catch {
        args = {};
      }
      const resultado = ev.onHerramienta(llamada.function.name, args);
      mensajes.push({ role: "tool", tool_call_id: llamada.id, content: JSON.stringify(resultado) });
    }
  }
  throw new Error("La pregunta necesitó demasiados pasos. Intenta preguntarlo de forma más directa.");
}

/** Envía audio WAV (base64) al servidor y devuelve lo que se entendió. */
export async function transcribir(audioBase64: string, pistas: string, senal: AbortSignal): Promise<string> {
  const r = await fetch("/api/asistente", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modo: "transcribir", audio: audioBase64, pistas }),
    signal: senal,
  });
  if (!r.ok) throw new Error(await leerError(r));
  return (await r.json()).texto as string;
}
