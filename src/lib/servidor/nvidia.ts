import "server-only";

/** Cliente mínimo del endpoint gratuito de NVIDIA (compatible con OpenAI). La key vive solo en el servidor. */
const URL_CHAT = "https://integrate.api.nvidia.com/v1/chat/completions";
export const MODELO = process.env.NVIDIA_MODEL || "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";

export class ErrorNvidia extends Error {
  constructor(mensaje: string, public estado: number) {
    super(mensaje);
  }
}

const espera = (ms: number, senal?: AbortSignal) =>
  new Promise<void>((ok, mal) => {
    const t = setTimeout(ok, ms);
    senal?.addEventListener("abort", () => { clearTimeout(t); mal(new DOMException("Cancelado", "AbortError")); }, { once: true });
  });

/**
 * POST a chat/completions. Reintenta ante 429/503 (el endpoint gratuito se satura a ratos)
 * con espera creciente; devuelve la respuesta cruda (con streaming si se pidió).
 */
export async function chatNvidia(cuerpo: Record<string, unknown>, senal?: AbortSignal): Promise<Response> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new ErrorNvidia("Falta configurar NVIDIA_API_KEY en el servidor.", 500);
  for (let intento = 0; ; intento++) {
    const r = await fetch(URL_CHAT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: cuerpo.stream ? "text/event-stream" : "application/json" },
      body: JSON.stringify({ model: MODELO, ...cuerpo }),
      signal: senal,
    });
    if (r.ok) return r;
    if ((r.status === 429 || r.status === 503) && intento < 4) {
      await espera(1200 * (intento + 1), senal);
      continue;
    }
    const detalle = (await r.text()).slice(0, 300);
    console.error("NVIDIA", r.status, detalle);
    if (r.status === 429 || r.status === 503) throw new ErrorNvidia("El asistente gratuito está saturado en este momento. Intenta de nuevo en unos segundos.", 503);
    if (r.status === 401 || r.status === 403) throw new ErrorNvidia("La API key de NVIDIA no es válida o expiró.", 502);
    throw new ErrorNvidia("El asistente no pudo responder. Intenta de nuevo.", 502);
  }
}

/**
 * Igual que chatNvidia con stream: true, pero si el primer evento del stream trae un error
 * (el endpoint gratuito a veces responde 200 con "ResourceExhausted" dentro del stream),
 * reintenta antes de empezar a transmitir. Devuelve un stream SSE listo para reenviar.
 */
export async function chatNvidiaStream(cuerpo: Record<string, unknown>, senal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  for (let intento = 0; ; intento++) {
    const r = await chatNvidia({ ...cuerpo, stream: true }, senal);
    const lector = r.body!.getReader();
    const decodificador = new TextDecoder();
    const leidos: Uint8Array[] = [];
    let texto = "";
    // Lee hasta tener el primer evento completo.
    while (!texto.includes("\n\n")) {
      const { done, value } = await lector.read();
      if (done) break;
      leidos.push(value);
      texto += decodificador.decode(value, { stream: true });
    }
    const primero = texto.split("\n\n")[0];
    if (primero.includes('"error"')) {
      await lector.cancel().catch(() => {});
      const saturado = /ResourceExhausted|limit reached|overloaded/i.test(primero);
      if (saturado && intento < 4) {
        await espera(1500 * (intento + 1), senal);
        continue;
      }
      console.error("NVIDIA stream", primero.slice(0, 300));
      throw new ErrorNvidia(saturado ? "El asistente gratuito está saturado en este momento. Intenta de nuevo en unos segundos." : "El asistente no pudo responder. Intenta de nuevo.", 503);
    }
    return new ReadableStream<Uint8Array>({
      start(controlador) {
        leidos.forEach((t) => controlador.enqueue(t));
      },
      async pull(controlador) {
        const { done, value } = await lector.read();
        if (done) controlador.close();
        else controlador.enqueue(value);
      },
      cancel() {
        void lector.cancel();
      },
    });
  }
}
