"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Mic, RotateCcw, Sparkles, Square, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThinkingPromptInput, type ThinkingStatus, type ThinkingStep } from "@/components/ui/thinking-prompt-input";
import { useDash } from "@/components/Contexto";
import { useNube } from "@/components/nube/contexto-nube";
import { describirPaso, describirTabla, ejecutar, type Contexto } from "@/lib/asistente/herramientas";
import { correrTurno, transcribir, type Mensaje } from "@/lib/asistente/cliente";
import { grabar, hablar, type Grabacion } from "@/lib/asistente/audio";

const ETIQUETAS = {
  thinking: "Pensando",
  thoughtFor: (s: number) => `Pensó ${s} s`,
  think: "Razonar",
  send: "Enviar pregunta",
  stop: "Detener",
  conversation: "Conversación",
  response: "Respuesta",
  complete: "Listo",
  inProgress: "En curso",
};

const SUGERENCIAS = [
  "¿Qué región tiene el mayor monto total?",
  "¿Cómo evolucionó el monto por mes?",
  "Muéstrame solo los créditos en mora",
];

type Turno = { status: ThinkingStatus; prompt: string; steps: ThinkingStep[]; answer: string; nota?: string };
const VACIO: Turno = { status: "idle", prompt: "", steps: [], answer: "" };

export function Asistente() {
  const dash = useDash();
  const nube = useNube();
  const conSesion = Boolean(nube?.usuario);
  const [abierto, setAbierto] = useState(false);
  const [turno, setTurno] = useState<Turno>(VACIO);
  const [think, setThink] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [microfono, setMicrofono] = useState<"listo" | "grabando" | "procesando">("listo");
  const [nivel, setNivel] = useState(0);
  const [hablando, setHablando] = useState(false);
  const [vozActiva, setVozActiva] = useState(true);
  const historial = useRef<Mensaje[]>([]);
  const cancelador = useRef<AbortController | null>(null);
  const grabacion = useRef<Grabacion | null>(null);
  const inicio = useRef(0);

  // Estado más reciente del dashboard para las herramientas (cambia al aplicar filtros).
  const ultimo = useRef(dash);
  useEffect(() => {
    ultimo.current = dash;
  });

  const contexto = useCallback((): Contexto | null => {
    const d = ultimo.current;
    if (!d.tabla) return null;
    return {
      tabla: d.tabla,
      filas: d.filas,
      filtros: d.filtros,
      vistas: d.tabla.esDetalle ? ["resumen", "tendencias", "segmentos", "riesgo", "relaciones", "explorar", "datos", "lectura"] : ["resumen", "datos", "lectura"],
      acciones: {
        setFiltro: d.setFiltro,
        limpiarFiltros: d.limpiarFiltros,
        setVista: (v) => d.setVista(v as typeof d.vista),
        setMedida: d.setMedida,
      },
    };
  }, []);

  /** Palabras de la tabla (nombre, columnas y valores) para que la transcripción las reconozca. */
  const vocabulario = useCallback(() => {
    const t = ultimo.current.tabla;
    if (!t) return "";
    const valores = t.categorias.flatMap((c) => [...new Set(t.filas.slice(0, 2000).map((f) => String(f[c] ?? "")))].slice(0, 15));
    return [t.nombre, ...t.columnas.map((c) => c.nombre), ...valores].filter(Boolean).join(", ").slice(0, 1400);
  }, []);

  // ⌘J abre y cierra el asistente.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setAbierto((a) => !a);
      }
      if (e.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  // Contador de segundos mientras piensa.
  useEffect(() => {
    if (turno.status !== "thinking") return;
    const id = setInterval(() => setSegundos(Math.round((Date.now() - inicio.current) / 1000)), 500);
    return () => clearInterval(id);
  }, [turno.status]);

  // Nivel del micrófono para la animación.
  useEffect(() => {
    if (microfono !== "grabando") return;
    let cuadro = 0;
    const animar = () => {
      setNivel(grabacion.current?.nivel() ?? 0);
      cuadro = requestAnimationFrame(animar);
    };
    cuadro = requestAnimationFrame(animar);
    return () => cancelAnimationFrame(cuadro);
  }, [microfono]);

  const preguntar = useCallback(
    async (pregunta: string, opciones: { think: boolean; porVoz?: boolean; controlador?: AbortController }) => {
      const ctx = contexto();
      if (!ctx) return;
      const controlador = opciones.controlador ?? new AbortController();
      cancelador.current = controlador;
      inicio.current = Date.now();
      setSegundos(0);
      setTurno({ status: "thinking", prompt: pregunta, steps: [{ id: "leer", text: "Leyendo tu pregunta…", status: "active" }], answer: "" });
      const pasos: ThinkingStep[] = [{ id: "leer", text: "Leyendo tu pregunta…", status: "complete" }];
      try {
        const { historial: nuevo, respuesta } = await correrTurno(
          [...historial.current, { role: "user", content: pregunta }],
          describirTabla(ctx, ultimo.current.vista, ultimo.current.medida),
          opciones.think,
          {
            onRazonando: () => setTurno((t) => (t.status === "thinking" && !t.steps.some((s) => s.id === "razonar")
              ? { ...t, steps: [...t.steps.map((s) => ({ ...s, status: "complete" as const })), { id: "razonar", text: "Razonando la respuesta…", status: "active" }] }
              : t)),
            onHerramienta: (nombre, args) => {
              pasos.forEach((p) => (p.status = "complete"));
              pasos.push({ id: `${nombre}-${pasos.length}`, text: describirPaso(nombre, args), status: "active" });
              setTurno((t) => ({ ...t, steps: [...pasos] }));
              return ejecutar(nombre, args, contexto() ?? ctx);
            },
            onTexto: (texto) => setTurno((t) => ({ ...t, status: "answering", answer: texto, steps: t.steps.map((s) => ({ ...s, status: "complete" as const })) })),
          },
          controlador.signal,
        );
        historial.current = nuevo.slice(-30);
        setSegundos(Math.round((Date.now() - inicio.current) / 1000));
        setTurno((t) => ({ ...t, status: "done", answer: respuesta || "No encontré una respuesta para eso.", steps: pasos.length > 1 ? pasos.map((p) => ({ ...p, status: "complete" as const })) : [] }));
        if (opciones.porVoz && vozActiva && respuesta) {
          setHablando(true);
          await hablar(respuesta, controlador.signal);
          setHablando(false);
        }
      } catch (e) {
        setHablando(false);
        if (controlador.signal.aborted) {
          setTurno((t) => ({ ...t, status: "done", answer: t.answer || "Detuviste la respuesta.", steps: t.steps.map((s) => ({ ...s, status: "complete" as const })) }));
          return;
        }
        setTurno((t) => ({ ...t, status: "done", answer: e instanceof Error ? e.message : "El asistente no pudo responder.", nota: "Puedes intentarlo de nuevo.", steps: [] }));
      }
    },
    [contexto, vozActiva],
  );

  const detener = useCallback(() => {
    cancelador.current?.abort();
    setHablando(false);
  }, []);

  const alternarMicrofono = useCallback(async () => {
    if (microfono === "grabando") {
      const g = grabacion.current;
      grabacion.current = null;
      if (!g) return;
      setMicrofono("procesando");
      const controlador = new AbortController();
      cancelador.current = controlador;
      inicio.current = Date.now();
      setTurno({ status: "thinking", prompt: "🎙️ Mensaje de voz", steps: [{ id: "oir", text: "Escuchando tu pregunta…", status: "active" }], answer: "" });
      try {
        const audio = await g.detener();
        const texto = await transcribir(audio, vocabulario(), controlador.signal);
        setMicrofono("listo");
        await preguntar(texto, { think, porVoz: true, controlador });
      } catch (e) {
        setMicrofono("listo");
        if (controlador.signal.aborted) return setTurno(VACIO);
        const mensaje = e instanceof Error && e.message !== "corto" ? e.message : "El audio fue muy corto. Mantén el micrófono activo mientras hablas.";
        setTurno({ status: "done", prompt: "🎙️ Mensaje de voz", steps: [], answer: mensaje });
      }
      return;
    }
    detener();
    try {
      grabacion.current = await grabar(() => void alternarMicrofonoRef.current());
      setMicrofono("grabando");
    } catch (e) {
      setTurno({ status: "done", prompt: "🎙️ Mensaje de voz", steps: [], answer: e instanceof Error ? e.message : "No pude usar el micrófono." });
    }
  }, [microfono, preguntar, think, detener, vocabulario]);
  const alternarMicrofonoRef = useRef(alternarMicrofono);
  useEffect(() => {
    alternarMicrofonoRef.current = alternarMicrofono;
  });

  const nuevaConversacion = () => {
    detener();
    grabacion.current?.cancelar();
    grabacion.current = null;
    setMicrofono("listo");
    historial.current = [];
    setTurno(VACIO);
  };

  if (!dash.tabla) return null;
  const ocupado = turno.status === "thinking" || turno.status === "answering" || microfono === "procesando";

  const botonMicrofono = (
    <button
      type="button"
      onClick={() => void alternarMicrofono()}
      disabled={ocupado && microfono !== "grabando"}
      aria-pressed={microfono === "grabando"}
      aria-label={microfono === "grabando" ? "Terminar y enviar el mensaje de voz" : "Preguntar por voz"}
      className={`relative inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
        microfono === "grabando" ? "border-transparent bg-[var(--critical)] text-white" : "border-border bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      {microfono === "procesando" ? <Loader2 className="size-3.5 animate-spin" /> : microfono === "grabando" ? <Square className="size-3 fill-current" /> : <Mic className="size-3.5" />}
      {microfono === "grabando" ? "Enviar" : "Voz"}
      {microfono === "grabando" && (
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-[var(--critical)]" style={{ transform: `scale(${1 + nivel * 0.35})`, opacity: 0.5 }} />
      )}
    </button>
  );

  return (
    <>
      <AnimatePresence>
        {abierto && (
          <motion.section
            role="dialog"
            aria-label="Asistente de datos"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-50 flex flex-col bg-background sm:inset-auto sm:right-6 sm:bottom-24 sm:h-[min(640px,calc(100vh-8rem))] sm:w-[420px] sm:rounded-2xl sm:border sm:border-border sm:shadow-[var(--shadow-pop)]"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <span className="grid size-7 place-items-center rounded-lg text-white" style={{ background: "linear-gradient(135deg, var(--s1), var(--s7))" }}>
                <Sparkles size={14} aria-hidden />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-[13px] font-semibold">Asistente de datos</p>
                <p className="truncate text-[11px] text-muted-foreground">{dash.tabla.nombre} · {dash.filas.length.toLocaleString("es-CL")} registros</p>
              </div>
              {hablando ? (
                <Button variant="ghost" size="icon" onClick={detener} aria-label="Detener la voz"><VolumeX /></Button>
              ) : (
                <Button variant="ghost" size="icon" onClick={() => setVozActiva((v) => !v)} aria-pressed={vozActiva} aria-label={vozActiva ? "Silenciar respuestas habladas" : "Activar respuestas habladas"}>
                  {vozActiva ? <Volume2 /> : <VolumeX />}
                </Button>
              )}
              {turno.status !== "idle" && (
                <Button variant="ghost" size="icon" onClick={nuevaConversacion} aria-label="Nueva conversación"><RotateCcw /></Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => setAbierto(false)} aria-label="Cerrar asistente"><X /></Button>
            </header>

            {conSesion ? (
              <div className="flex min-h-0 flex-1 flex-col p-4">
                {turno.status === "idle" && (
                  <div className="mb-4 flex flex-1 flex-col justify-end gap-3">
                    <p className="text-[15px] font-medium">Pregúntale a tus datos, por escrito o por voz.</p>
                    <p className="text-[13px] text-muted-foreground">Calculo con los mismos datos y filtros que ves en el dashboard, y puedo filtrar los gráficos por ti.</p>
                    <div className="flex flex-col items-start gap-1.5">
                      {SUGERENCIAS.map((s) => (
                        <button key={s} type="button" onClick={() => void preguntar(s, { think })} className="rounded-full border border-border bg-card px-3 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <ThinkingPromptInput
                  className="max-w-none"
                  status={turno.status}
                  prompt={turno.prompt}
                  steps={turno.steps}
                  answer={turno.answer}
                  answerNote={turno.nota ?? (turno.status === "done" ? "Respuesta generada por IA (NVIDIA Nemotron) con los datos de esta tabla." : undefined)}
                  elapsedSeconds={segundos}
                  think={think}
                  onThinkChange={setThink}
                  onSubmit={(texto, o) => void preguntar(texto, { think: o.think })}
                  onStop={detener}
                  placeholder="Pregúntale a tus datos…"
                  followUpPlaceholder="Haz otra pregunta"
                  labels={ETIQUETAS}
                  accessory={botonMicrofono}
                  disabled={microfono === "procesando"}
                />
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <Sparkles size={28} className="text-accent" aria-hidden />
                <p className="text-[15px] font-semibold">Conversa con tus datos</p>
                <p className="text-[13px] text-muted-foreground">Crea una cuenta gratis para preguntarle a tus dashboards por escrito o por voz.</p>
                <Button asChild><Link href="/registro">Crear cuenta</Link></Button>
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-label={abierto ? "Cerrar asistente" : "Preguntar a tus datos (⌘J)"}
        className={`fixed right-4 z-40 items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-white shadow-[var(--shadow-pop)] outline-none transition-transform hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:right-6 ${abierto ? "hidden h-12 sm:inline-flex" : "inline-flex h-12"}`}
        style={{ bottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))", background: "linear-gradient(135deg, var(--s1), var(--s7))" }}
      >
        {abierto ? <X size={18} aria-hidden /> : <Sparkles size={18} aria-hidden />}
        <span className="hidden sm:inline">{abierto ? "Cerrar" : "Preguntar"}</span>
        {(hablando || microfono === "grabando") && !abierto && <span className="pulse size-2 rounded-full bg-white" aria-hidden />}
      </button>
    </>
  );
}
