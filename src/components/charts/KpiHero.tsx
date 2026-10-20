"use client";

import { useId } from "react";
import NumberFlow from "@number-flow/react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { formato, type Punto } from "@/lib/calculo";
import { Tip, TIP_WRAPPER } from "./base";
import { useAnimar } from "./tema";

export type Sentido = "sube" | "baja" | "neutro";

export interface Delta {
  texto: string;
  /** Dirección del cambio. */
  sentido: Sentido;
  /** false si subir es malo (p. ej. mora): invierte el color, no la flecha. */
  subirEsBueno?: boolean;
}

/** Valor listo para NumberFlow con el mismo criterio de formato() (millones como "12,34 M"). */
function flujo(v: number, decimales?: boolean) {
  if (Math.abs(v) >= 1e6) return { value: v / 1e6, suffix: " M", format: { minimumFractionDigits: 2, maximumFractionDigits: 2 } };
  const enteros = !decimales && (Number.isInteger(v) || Math.abs(v) >= 1000);
  return { value: v, suffix: "", format: enteros ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 } };
}

export function KpiHero({
  etiqueta,
  valor,
  sufijo,
  detalle,
  delta,
  tendencia,
  grande = false,
  decimales,
}: {
  etiqueta: string;
  valor: number;
  /** Unidad tras el número (p. ej. "%"). */
  sufijo?: string;
  detalle?: string;
  delta?: Delta;
  tendencia?: Punto[];
  /** Cifra héroe (≥ 48 px): una por vista. */
  grande?: boolean;
  decimales?: boolean;
}) {
  const animar = useAnimar();
  const f = flujo(valor, decimales);
  const bueno = delta && delta.sentido !== "neutro" && (delta.sentido === "sube") === (delta.subirEsBueno ?? true);
  const color = !delta || delta.sentido === "neutro" ? "var(--text-3)" : bueno ? "var(--ok-text)" : "var(--critical-text)";
  const fondo = !delta || delta.sentido === "neutro" ? "var(--surface-2)" : bueno ? "var(--ok-soft)" : "var(--critical-soft)";
  const Icono = delta?.sentido === "sube" ? ArrowUpRight : delta?.sentido === "baja" ? ArrowDownRight : Minus;
  const textoDelta = delta ? (delta.sentido === "neutro" ? "sin cambio relevante" : bueno ? "mejora" : "empeora") : "";

  return (
    <div className={`card fade-in flex min-w-0 flex-col justify-between ${grande ? "min-h-[188px]" : "min-h-[148px]"}`} style={{ padding: "var(--pad)" }}>
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium text-ink-3" title={etiqueta}>
          {etiqueta}
        </p>
        <p
          className={`mt-1 font-semibold leading-none tracking-tight text-ink ${grande ? "text-[40px] sm:text-[52px]" : "text-[24px] sm:text-[30px]"}`}
        >
          {Number.isFinite(valor) ? (
            <NumberFlow value={f.value} suffix={`${f.suffix}${sufijo ?? ""}`} format={f.format} locales="es-CL" animated={animar} />
          ) : (
            "—"
          )}
        </p>
        <div className="mt-2 flex min-h-5 flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
          {delta && (
            <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium" style={{ color, background: fondo }} title={textoDelta}>
              <Icono size={12} aria-hidden />
              <span className="num">{delta.texto}</span>
              <span className="sr-only">({textoDelta})</span>
            </span>
          )}
          {detalle && <span className="truncate">{detalle}</span>}
        </div>
      </div>
      {tendencia && tendencia.length >= 3 && <Chispa puntos={tendencia} alto={grande ? "100%" : 40} etiqueta={etiqueta} className={grande ? "min-h-20 flex-1" : ""} />}
    </div>
  );
}

/** Sparkline de área con degradado; el último periodo lleva el punto. */
export function Chispa({
  puntos,
  alto = 40,
  etiqueta,
  color = "var(--s1)",
  className = "",
}: {
  puntos: Punto[];
  alto?: number | string;
  etiqueta: string;
  color?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const animar = useAnimar();
  const datos = puntos.map((p) => ({ ...p, valor: Number.isFinite(p.valor) ? p.valor : null }));
  const ultimo = datos.length - 1;
  return (
    <div className={`-mx-1 mt-3 [&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none ${className}`} style={{ height: alto }} aria-label={`Tendencia de ${etiqueta}`} role="img">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 200, height: 40 }}>
        <AreaChart data={datos} margin={{ top: 4, right: 6, bottom: 2, left: 6 }}>
          <defs>
            <linearGradient id={`k${id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            wrapperStyle={TIP_WRAPPER}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const p = active && payload?.[0]?.payload;
              return p ? <Tip titulo={p.etiqueta} filas={[{ nombre: etiqueta, valor: formato(p.valor) }]} /> : null;
            }}
          />
          <Area
            type="monotone"
            dataKey="valor"
            stroke={color}
            strokeWidth={2}
            fill={`url(#k${id})`}
            connectNulls
            isAnimationActive={animar}
            animationDuration={700}
            dot={(p: { index?: number; cx?: number; cy?: number }) =>
              p.index === ultimo && p.cx !== undefined && p.cy !== undefined ? (
                <circle key="u" cx={p.cx} cy={p.cy} r={3.5} fill={color} stroke="var(--surface)" strokeWidth={2} />
              ) : (
                <g key={p.index} />
              )
            }
            activeDot={{ r: 4, fill: color, stroke: "var(--surface)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
