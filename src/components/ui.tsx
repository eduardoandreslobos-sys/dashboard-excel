"use client";

import type { ReactNode } from "react";
import { AlertOctagon, AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Circle, Clock, Minus } from "lucide-react";
import type { Tono } from "@/lib/analisis";

export function Panel({
  titulo,
  subtitulo,
  acciones,
  children,
  className = "",
}: {
  titulo?: ReactNode;
  subtitulo?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card fade-in min-w-0 ${className}`} style={{ padding: "var(--pad)" }}>
      {(titulo || acciones) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {titulo && <h3 className="text-[14px] font-semibold text-ink">{titulo}</h3>}
            {subtitulo && <p className="mt-0.5 text-[12px] text-ink-3">{subtitulo}</p>}
          </div>
          {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col" style={{ gap: "var(--gap)" }}>
      <div>
        <h2 className="text-[16px] font-semibold tracking-tight text-ink">{titulo}</h2>
        {descripcion && <p className="mt-0.5 text-[13px] text-ink-3">{descripcion}</p>}
      </div>
      {children}
    </div>
  );
}

export function Grilla({ children, columnas = 2 }: { children: ReactNode; columnas?: 2 | 3 | 4 }) {
  const cls = { 2: "grid-cols-1 lg:grid-cols-2", 3: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3", 4: "grid-cols-2 xl:grid-cols-4" }[columnas];
  return (
    <div className={`grid ${cls}`} style={{ gap: "var(--gap)" }}>
      {children}
    </div>
  );
}

export function Segmentado<T extends string>({
  opciones,
  valor,
  onChange,
  etiqueta,
}: {
  opciones: { valor: T; texto: string }[];
  valor: T;
  onChange: (v: T) => void;
  etiqueta: string;
}) {
  return (
    <div className="seg" role="group" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button key={o.valor} type="button" aria-pressed={o.valor === valor} onClick={() => onChange(o.valor)}>
          {o.texto}
        </button>
      ))}
    </div>
  );
}

export function Selector<T extends string>({
  etiqueta,
  valor,
  opciones,
  onChange,
}: {
  etiqueta: string;
  valor: T;
  opciones: { valor: T; texto: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[12px] text-ink-3">
      <span className="hidden sm:inline">{etiqueta}</span>
      <select className="ctl max-w-[220px]" value={valor} onChange={(e) => onChange(e.target.value as T)} aria-label={etiqueta}>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Sparkline SVG liviano para las tarjetas KPI. */
export function Sparkline({ valores, color }: { valores: number[]; color: string }) {
  const v = valores.filter(Number.isFinite);
  if (v.length < 2) return null;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const w = 120;
  const h = 32;
  const pts = v.map((x, i) => [(i / (v.length - 1)) * w, h - 3 - ((x - min) / (max - min || 1)) * (h - 6)]);
  const linea = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const id = `g${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${linea}L${w},${h}L0,${h}Z`} fill={`url(#${id})`} />
      <path d={linea} fill="none" stroke={color} strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill={color} />
    </svg>
  );
}

export function KPI({
  etiqueta,
  valor,
  detalle,
  delta,
  sentido,
  tendencia,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  delta?: string;
  /** subida = bueno (verde), bajada = malo; neutro para tasas/promedios. */
  sentido?: "sube" | "baja" | "neutro";
  tendencia?: number[];
}) {
  const color =
    sentido === "sube" ? "var(--ok-text)" : sentido === "baja" ? "var(--critical-text)" : "var(--text-3)";
  const fondo = sentido === "sube" ? "var(--ok-soft)" : sentido === "baja" ? "var(--critical-soft)" : "var(--surface-2)";
  const Icono = sentido === "sube" ? ArrowUpRight : sentido === "baja" ? ArrowDownRight : Minus;
  return (
    <div className="card fade-in flex min-h-[132px] flex-col justify-between" style={{ padding: "var(--pad)" }}>
      <div>
        <p className="truncate text-[12px] font-medium text-ink-3" title={etiqueta}>
          {etiqueta}
        </p>
        <p className="mt-1 text-[22px] font-semibold leading-tight tracking-tight text-ink tabular-nums sm:text-[30px]">{valor}</p>
        <div className="mt-1 flex min-h-5 flex-wrap items-center gap-1.5 text-[11px] text-ink-3 [&>span:last-child]:hidden sm:[&>span:last-child]:inline">
          {delta && (
            <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium" style={{ color, background: fondo }}>
              <Icono size={12} aria-hidden />
              <span className="num">{delta}</span>
            </span>
          )}
          {detalle && <span className="truncate">{detalle}</span>}
        </div>
      </div>
      {tendencia && (
        <div className="mt-2">
          <Sparkline valores={tendencia} color="var(--accent)" />
        </div>
      )}
    </div>
  );
}

const ICONOS: Record<Tono, typeof CheckCircle2> = {
  bueno: CheckCircle2,
  alerta: Clock,
  serio: AlertTriangle,
  critico: AlertOctagon,
  neutro: Circle,
};
const COLORES: Record<Tono, [string, string]> = {
  bueno: ["var(--ok-text)", "var(--ok-soft)"],
  alerta: ["var(--warn-text)", "var(--warn-soft)"],
  serio: ["var(--serious-text)", "var(--serious-soft)"],
  critico: ["var(--critical-text)", "var(--critical-soft)"],
  neutro: ["var(--text-2)", "var(--surface-2)"],
};

export function Estado({ tono, texto }: { tono: Tono; texto: string }) {
  const Icono = ICONOS[tono];
  const [color, fondo] = COLORES[tono];
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium" style={{ color, background: fondo }}>
      <Icono size={12} aria-hidden />
      {texto}
    </span>
  );
}

export const COLOR_TONO: Record<Tono, string> = {
  bueno: "var(--ok)",
  alerta: "var(--warn)",
  serio: "var(--serious)",
  critico: "var(--critical)",
  neutro: "var(--neutral)",
};

/** Renderiza **negritas** de los hallazgos sin usar HTML crudo. */
export function Rico({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
        parte.startsWith("**") ? (
          <strong key={i} className="font-semibold text-ink">
            {parte.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{parte}</span>
        ),
      )}
    </>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className="card p-10 text-center text-[13px] text-ink-3">{children}</div>;
}
