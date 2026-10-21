"use client";

/** Grabación del micrófono → WAV 16 kHz mono (lo que acepta el modelo) y reproducción en cola de la voz. */

const FRECUENCIA = 16_000;
const MAX_SEGUNDOS = 30;

export interface Grabacion {
  detener: () => Promise<string>;
  cancelar: () => void;
  /** Nivel de volumen 0–1, para la animación del botón. */
  nivel: () => number;
}

/** Empieza a grabar. `detener()` devuelve el audio como WAV en base64. */
export async function grabar(alLimite: () => void): Promise<Grabacion> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador no permite usar el micrófono.");
  let flujo: MediaStream;
  try {
    flujo = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch {
    throw new Error("No tengo permiso para usar el micrófono. Actívalo en la configuración del navegador.");
  }
  const contexto = new AudioContext();
  const analizador = contexto.createAnalyser();
  analizador.fftSize = 512;
  contexto.createMediaStreamSource(flujo).connect(analizador);
  const muestras = new Uint8Array(analizador.fftSize);
  const grabador = new MediaRecorder(flujo);
  const trozos: Blob[] = [];
  grabador.ondataavailable = (e) => e.data.size && trozos.push(e.data);
  grabador.start(250);
  const limite = setTimeout(alLimite, MAX_SEGUNDOS * 1000);

  const cerrar = () => {
    clearTimeout(limite);
    flujo.getTracks().forEach((t) => t.stop());
    void contexto.close();
  };

  return {
    nivel: () => {
      analizador.getByteTimeDomainData(muestras);
      let max = 0;
      for (const m of muestras) max = Math.max(max, Math.abs(m - 128));
      return Math.min(1, max / 64);
    },
    cancelar: () => {
      if (grabador.state !== "inactive") grabador.stop();
      cerrar();
    },
    detener: () =>
      new Promise<string>((ok, mal) => {
        grabador.onstop = async () => {
          cerrar();
          try {
            const blob = new Blob(trozos, { type: grabador.mimeType });
            ok(await aWavBase64(await blob.arrayBuffer()));
          } catch {
            mal(new Error("No pude procesar el audio grabado."));
          }
        };
        grabador.stop();
      }),
  };
}

/** Decodifica cualquier formato que grabe el navegador y lo reescribe como WAV 16 kHz mono. */
async function aWavBase64(datos: ArrayBuffer): Promise<string> {
  const decodificador = new AudioContext();
  const original = await decodificador.decodeAudioData(datos);
  void decodificador.close();
  const duracion = Math.min(original.duration, MAX_SEGUNDOS);
  if (duracion < 0.4) throw new Error("corto");
  const offline = new OfflineAudioContext(1, Math.ceil(duracion * FRECUENCIA), FRECUENCIA);
  const fuente = offline.createBufferSource();
  fuente.buffer = original;
  fuente.connect(offline.destination);
  fuente.start();
  const pcm = (await offline.startRendering()).getChannelData(0);

  const wav = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const escribir = (o: number, s: string) => [...s].forEach((c, i) => wav.setUint8(o + i, c.charCodeAt(0)));
  escribir(0, "RIFF");
  wav.setUint32(4, 36 + pcm.length * 2, true);
  escribir(8, "WAVEfmt ");
  wav.setUint32(16, 16, true);
  wav.setUint16(20, 1, true);
  wav.setUint16(22, 1, true);
  wav.setUint32(24, FRECUENCIA, true);
  wav.setUint32(28, FRECUENCIA * 2, true);
  wav.setUint16(32, 2, true);
  wav.setUint16(34, 16, true);
  escribir(36, "data");
  wav.setUint32(40, pcm.length * 2, true);
  pcm.forEach((v, i) => wav.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true));

  const bytes = new Uint8Array(wav.buffer);
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

/** Divide la respuesta en oraciones para que la primera suene cuanto antes. */
export function oraciones(texto: string): string[] {
  return (texto.match(/[^.!?¿¡\n]+[.!?]*/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    .reduce<string[]>((acc, s) => {
      // Une oraciones muy cortas para evitar pausas entrecortadas.
      if (acc.length && (acc[acc.length - 1].length < 40 || s.length < 20)) acc[acc.length - 1] += " " + s;
      else acc.push(s);
      return acc;
    }, []);
}

/** Lee la respuesta en voz alta con Isabela: pide cada oración a /api/voz y las reproduce en orden. */
export function hablar(texto: string, senal: AbortSignal): Promise<void> {
  const partes = oraciones(texto).slice(0, 12);
  // Se piden todas en paralelo (la primera llega antes) y se reproducen en orden.
  const audios = partes.map((p) =>
    fetch("/api/voz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: p }), signal: senal })
      .then((r) => (r.ok ? r.blob() : null))
      .catch(() => null),
  );
  return (async () => {
    for (const promesa of audios) {
      const blob = await promesa;
      if (!blob || senal.aborted) continue;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      try {
        await new Promise<void>((ok) => {
          audio.onended = () => ok();
          audio.onerror = () => ok();
          senal.addEventListener("abort", () => { audio.pause(); ok(); }, { once: true });
          void audio.play().catch(() => ok());
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  })();
}
