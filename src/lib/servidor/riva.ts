import "server-only";
import * as grpc from "@grpc/grpc-js";
import protobuf from "protobufjs";

/**
 * Síntesis de voz con Magpie TTS Multilingual alojado por NVIDIA (Riva sobre gRPC).
 * Subconjunto mínimo de riva_tts.proto / riva_audio.proto (nvidia-riva/common, licencia MIT),
 * embebido para no leer archivos .proto en tiempo de ejecución.
 */
const PROTO = `
syntax = "proto3";
package nvidia.riva.tts;
enum AudioEncoding { ENCODING_UNSPECIFIED = 0; LINEAR_PCM = 1; FLAC = 2; MULAW = 3; OGGOPUS = 4; ALAW = 20; }
message SynthesizeSpeechRequest {
  string text = 1;
  string language_code = 2;
  AudioEncoding encoding = 3;
  int32 sample_rate_hz = 4;
  string voice_name = 5;
}
message SynthesizeSpeechResponse { bytes audio = 1; }
`;

const raiz = protobuf.parse(PROTO).root;
const Peticion = raiz.lookupType("nvidia.riva.tts.SynthesizeSpeechRequest");
const Respuesta = raiz.lookupType("nvidia.riva.tts.SynthesizeSpeechResponse");

const SERVIDOR = "grpc.nvcf.nvidia.com:443";
const FUNCION_TTS = "877104f7-e885-42b9-8de8-f6e4c6303969";
export const VOZ = "Magpie-Multilingual.ES-US.Isabela";
export const FRECUENCIA = 22050;

let cliente: grpc.Client | null = null;
const conectar = () => (cliente ??= new grpc.Client(SERVIDOR, grpc.credentials.createSsl()));

/** Abre la conexión TLS con NVIDIA de antemano (mientras el usuario habla), para que la primera frase suene antes. */
export function calentar(): Promise<void> {
  return new Promise((ok) => conectar().waitForReady(Date.now() + 5000, () => ok()));
}

/** Devuelve PCM lineal de 16 bits mono a 22,05 kHz para el texto dado. */
export function sintetizar(texto: string, senal?: AbortSignal): Promise<Buffer> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return Promise.reject(new Error("Falta NVIDIA_API_KEY"));
  const metadatos = new grpc.Metadata();
  metadatos.set("function-id", FUNCION_TTS);
  metadatos.set("authorization", `Bearer ${key}`);
  const cuerpo = Peticion.create({ text: texto, languageCode: "es-US", encoding: 1, sampleRateHz: FRECUENCIA, voiceName: VOZ });
  return new Promise((ok, mal) => {
    const llamada = conectar().makeUnaryRequest(
      "/nvidia.riva.tts.RivaSpeechSynthesis/Synthesize",
      (m: protobuf.Message) => Buffer.from(Peticion.encode(m).finish()),
      (b: Buffer) => Respuesta.decode(b),
      cuerpo,
      metadatos,
      { deadline: Date.now() + 30_000 },
      (error, respuesta) => {
        if (error || !respuesta) return mal(error ?? new Error("Sin audio"));
        ok(Buffer.from((respuesta as unknown as { audio: Uint8Array }).audio));
      },
    );
    senal?.addEventListener("abort", () => llamada.cancel(), { once: true });
  });
}

/** Envuelve PCM de 16 bits mono en un archivo WAV. */
export function aWav(pcm: Buffer, frecuencia = FRECUENCIA): Buffer {
  const cabecera = Buffer.alloc(44);
  cabecera.write("RIFF", 0);
  cabecera.writeUInt32LE(36 + pcm.length, 4);
  cabecera.write("WAVEfmt ", 8);
  cabecera.writeUInt32LE(16, 16);
  cabecera.writeUInt16LE(1, 20);
  cabecera.writeUInt16LE(1, 22);
  cabecera.writeUInt32LE(frecuencia, 24);
  cabecera.writeUInt32LE(frecuencia * 2, 28);
  cabecera.writeUInt16LE(2, 32);
  cabecera.writeUInt16LE(16, 34);
  cabecera.write("data", 36);
  cabecera.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([cabecera, pcm]);
}
