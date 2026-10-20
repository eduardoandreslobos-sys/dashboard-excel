"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import * as echarts from "echarts/core";
import { BarChart, HeatmapChart, LineChart, ScatterChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { EChartsCoreOption, ECElementEvent } from "echarts/core";

echarts.use([
  BarChart, LineChart, ScatterChart, HeatmapChart,
  GridComponent, TooltipComponent, LegendComponent, VisualMapComponent,
  MarkLineComponent, MarkPointComponent, DataZoomComponent, SVGRenderer,
]);

export type Tokens = Record<
  | "surface" | "surface2" | "border" | "text" | "text2" | "text3" | "grid" | "accent"
  | "seq0" | "seq1" | "seq2" | "seq3" | "seq4" | "divNeg" | "divMid" | "divPos"
  | "ok" | "warn" | "serious" | "critical" | "neutral",
  string
> & { series: string[]; oscuro: boolean; fuente: string; mono: string };

const VARS: Record<Exclude<keyof Tokens, "series" | "oscuro" | "fuente" | "mono">, string> = {
  surface: "--surface", surface2: "--surface-2", border: "--border", text: "--text", text2: "--text-2",
  text3: "--text-3", grid: "--grid", accent: "--accent", seq0: "--seq-0", seq1: "--seq-1", seq2: "--seq-2",
  seq3: "--seq-3", seq4: "--seq-4", divNeg: "--div-neg", divMid: "--div-mid", divPos: "--div-pos",
  ok: "--ok", warn: "--warn", serious: "--serious", critical: "--critical", neutral: "--neutral",
};

let version = 0;
function suscribir(cb: () => void) {
  const avisar = () => {
    version++;
    cb();
  };
  const obs = new MutationObserver(avisar);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", avisar);
  return () => {
    obs.disconnect();
    mq.removeEventListener("change", avisar);
  };
}

let cache: { v: number; t: Tokens } | null = null;

function leerTokens(): Tokens {
  if (cache?.v === version) return cache.t;
  const cs = getComputedStyle(document.documentElement);
  const t = Object.fromEntries(Object.entries(VARS).map(([k, css]) => [k, cs.getPropertyValue(css).trim()])) as unknown as Tokens;
  t.series = Array.from({ length: 8 }, (_, i) => cs.getPropertyValue(`--s${i + 1}`).trim());
  t.oscuro = cs.colorScheme === "dark";
  // ECharts mide el texto en canvas, que no entiende var(): se pasa el nombre real de la fuente.
  t.fuente = `${cs.getPropertyValue("--font-geist-sans").trim() || "system-ui"}, system-ui, sans-serif`;
  t.mono = `${cs.getPropertyValue("--font-geist-mono").trim() || "ui-monospace"}, ui-monospace, monospace`;
  cache = { v: version, t };
  return t;
}

/** Lee los tokens CSS vigentes; se actualiza al cambiar el tema. */
export function useTokens(): Tokens | null {
  return useSyncExternalStore(suscribir, leerTokens, () => null);
}

/** Estilo base compartido por todos los gráficos. */
export function base(t: Tokens): EChartsCoreOption {
  return {
    backgroundColor: "transparent",
    color: t.series,
    textStyle: { fontFamily: t.fuente, color: t.text3, fontSize: 11 },
    animationDuration: 300,
    animationEasing: "cubicOut",
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      backgroundColor: t.surface,
      borderColor: t.border,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: t.text, fontSize: 12 },
      extraCssText: "border-radius:10px;box-shadow:var(--shadow-pop);",
      confine: true,
    },
    legend: { bottom: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: t.text2, fontSize: 12 } },
  };
}

export function ejeCategoria(t: Tokens) {
  return {
    axisLine: { lineStyle: { color: t.border } },
    axisTick: { show: false },
    axisLabel: { color: t.text3, fontSize: 11 },
    splitLine: { show: false },
  };
}

export function ejeValor(t: Tokens) {
  return {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: t.text3, fontSize: 11 },
    splitLine: { lineStyle: { color: t.grid } },
  };
}

interface Props {
  opcion: (t: Tokens) => EChartsCoreOption;
  alto?: number | string;
  onClick?: (e: ECElementEvent) => void;
  etiqueta: string;
}

export default function Grafico({ opcion, alto = "var(--chart-h)", onClick, etiqueta }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const clic = useRef(onClick);
  const tokens = useTokens();

  useEffect(() => {
    clic.current = onClick;
  }, [onClick]);

  useEffect(() => {
    if (!ref.current) return;
    const c = echarts.init(ref.current, null, { renderer: "svg" });
    chart.current = c;
    c.on("click", (e) => clic.current?.(e as ECElementEvent));
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    if (chart.current && tokens) {
      chart.current.setOption({ ...base(tokens), ...opcion(tokens) }, { notMerge: true });
      chart.current.getZr().setCursorStyle?.(onClick ? "pointer" : "default");
    }
  }, [opcion, tokens, onClick]);

  return <div ref={ref} role="img" aria-label={etiqueta} style={{ height: alto, width: "100%" }} />;
}
