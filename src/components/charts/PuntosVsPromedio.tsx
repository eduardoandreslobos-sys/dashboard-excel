"use client";

import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { compacto, formato, type Barra } from "@/lib/calculo";
import { CURSOR, EJE, Marco, Tip, TIP_WRAPPER } from "./base";
import { useAnimar } from "./tema";

const corta = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

interface Fila extends Barra {
  rango: [number, number];
  sobre: boolean;
}

/**
 * Piruletas desde el promedio general hasta el valor de cada segmento.
 * Color = polaridad (sobre / bajo el promedio) con la pareja divergente, y leyenda en texto.
 */
export function PuntosVsPromedio({
  barras,
  promedio,
  nombre,
  etiqueta,
  subirEsMalo = false,
  seleccionados,
  onSeleccionar,
  unidad = "",
}: {
  barras: Barra[];
  promedio: number;
  nombre: string;
  etiqueta?: string;
  /** true para métricas de riesgo: sobre el promedio se pinta con el polo cálido. */
  subirEsMalo?: boolean;
  seleccionados?: string[];
  onSeleccionar?: (etiqueta: string) => void;
  unidad?: string;
}) {
  const animar = useAnimar();
  const datos = useMemo<Fila[]>(
    () => barras.filter((b) => Number.isFinite(b.valor)).map((b) => ({ ...b, rango: [promedio, b.valor], sobre: b.valor >= promedio })),
    [barras, promedio],
  );
  const anchoEje = Math.min(150, Math.max(56, Math.max(0, ...datos.map((b) => Math.min(22, b.etiqueta.length))) * 6.4 + 8));
  const colorSobre = subirEsMalo ? "var(--div-neg)" : "var(--div-pos)";
  const colorBajo = subirEsMalo ? "var(--div-pos)" : "var(--div-neg)";
  const hay = (seleccionados?.length ?? 0) > 0;
  const fmt = (v: number) => `${formato(v)}${unidad}`;
  if (!datos.length) return <p className="py-10 text-center text-[13px] text-ink-3">Sin datos con los filtros actuales.</p>;

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2" aria-label="Leyenda">
        <li className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorSobre }} aria-hidden /> Sobre el promedio
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorBajo }} aria-hidden /> Bajo el promedio
        </li>
        <li className="inline-flex items-center gap-1.5 text-ink-3">
          <span className="h-3 w-0 border-l border-dashed border-ink-3" aria-hidden /> Promedio general {fmt(promedio)}
        </li>
      </ul>
      <Marco etiqueta={etiqueta ?? `${nombre} por segmento`} alto={Math.max(140, datos.length * 32 + 30)}>
        <ComposedChart data={datos} layout="vertical" margin={{ top: 4, right: 56, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" horizontal={false} />
          <XAxis type="number" {...EJE} domain={["auto", "auto"]} tickFormatter={(v: number) => compacto(v)} />
          <YAxis type="category" dataKey="etiqueta" {...EJE} width={anchoEje} interval={0} tick={{ ...EJE.tick, fill: "var(--text-2)" }} tickFormatter={(s: string) => corta(s, 22)} />
          <ReferenceLine x={promedio} stroke="var(--text-3)" strokeDasharray="4 4" ifOverflow="extendDomain" />
          <Tooltip
            cursor={CURSOR}
            wrapperStyle={TIP_WRAPPER}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const b = active ? (payload?.[0]?.payload as Fila | undefined) : undefined;
              if (!b) return null;
              const dif = b.valor - promedio;
              return (
                <Tip
                  titulo={b.etiqueta}
                  filas={[{ nombre, valor: fmt(b.valor), color: b.sobre ? colorSobre : colorBajo }]}
                  pie={
                    <>
                      <p>{`${dif >= 0 ? "+" : ""}${formato(dif)}${unidad} vs promedio (${fmt(promedio)})`}</p>
                      <p>{`${formato(b.n)} registros`}</p>
                      {onSeleccionar && <p className="text-accent">Clic para filtrar el dashboard</p>}
                    </>
                  }
                />
              );
            }}
          />
          <Bar
            dataKey="rango"
            isAnimationActive={animar}
            animationDuration={600}
            cursor={onSeleccionar ? "pointer" : undefined}
            onClick={onSeleccionar ? (d: { payload?: Fila }) => d.payload && onSeleccionar(d.payload.etiqueta) : undefined}
            shape={(p: { x?: number; y?: number; width?: number; height?: number; payload?: Fila }) => {
              const { x = 0, y = 0, width = 0, height = 0, payload } = p;
              if (!payload) return <g />;
              const color = payload.sobre ? colorSobre : colorBajo;
              const cy = y + height / 2;
              const x0 = Math.min(x, x + width);
              const x1 = Math.max(x, x + width);
              const fin = payload.sobre ? x1 : x0;
              const apagado = hay && !seleccionados!.includes(payload.etiqueta);
              return (
                <g opacity={apagado ? 0.3 : 1} style={{ transition: "opacity 200ms ease-out" }}>
                  <rect x={x0} y={y} width={Math.max(1, x1 - x0)} height={height} fill="transparent" />
                  <line x1={x0} x2={x1} y1={cy} y2={cy} stroke={color} strokeWidth={2} strokeLinecap="round" />
                  <circle cx={fin} cy={cy} r={6} fill={color} stroke="var(--surface)" strokeWidth={2} />
                  <text x={x1 + 12} y={cy} dy="0.35em" fontSize={11} style={{ fill: "var(--text-2)" }} className="num">
                    {compacto(payload.valor)}
                    {unidad}
                  </text>
                </g>
              );
            }}
          />
        </ComposedChart>
      </Marco>
    </div>
  );
}
