"use client";

import { useId, useMemo } from "react";
import { Area, AreaChart, Brush, CartesianGrid, ReferenceDot, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { compacto, formato, type Punto } from "@/lib/calculo";
import { EJE, GRILLA, Marco, pieTip, Tip, TIP_WRAPPER } from "./base";
import { useAnimar } from "./tema";

export interface Rango {
  desde: number;
  hasta: number;
}

/**
 * Área con degradado para una serie temporal: punto activo, máximo / mínimo / promedio
 * anotados y, opcionalmente, un Brush para elegir un rango de periodos.
 */
export function AreaTendencia({
  puntos,
  nombre,
  etiqueta,
  alto,
  color = "var(--s1)",
  sumable = true,
  anotar = true,
  brush = false,
  onRango,
}: {
  puntos: Punto[];
  /** Nombre de la serie (aparece en el tooltip). */
  nombre: string;
  etiqueta?: string;
  alto?: number | string;
  color?: string;
  /** Si la medida se suma, el tooltip muestra el % del total. */
  sumable?: boolean;
  anotar?: boolean;
  brush?: boolean;
  /** Se llama con los índices del rango elegido en el Brush. */
  onRango?: (r: Rango) => void;
}) {
  const id = useId().replace(/:/g, "");
  const animar = useAnimar();
  const datos = useMemo(() => puntos.map((p) => ({ ...p, valor: Number.isFinite(p.valor) ? p.valor : null })), [puntos]);
  const resumen = useMemo(() => {
    const validos = puntos.filter((p) => Number.isFinite(p.valor));
    if (!validos.length) return null;
    const max = validos.reduce((a, b) => (b.valor > a.valor ? b : a));
    const min = validos.reduce((a, b) => (b.valor < a.valor ? b : a));
    const total = validos.reduce((s, p) => s + p.valor, 0);
    return { max, min, total, promedio: total / validos.length };
  }, [puntos]);

  if (puntos.length < 2 || !resumen) return <p className="py-10 text-center text-[13px] text-ink-3">No hay suficientes periodos para dibujar una tendencia.</p>;

  const marcar = anotar && resumen.max.t !== resumen.min.t;
  return (
    <Marco etiqueta={etiqueta ?? `${nombre} en el tiempo`} alto={alto}>
      <AreaChart data={datos} margin={{ top: 22, right: 12, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`a${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.24} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRILLA} />
        <XAxis dataKey="etiqueta" {...EJE} minTickGap={24} tickMargin={8} />
        <YAxis {...EJE} width={52} tickFormatter={(v: number) => compacto(v)} />
        <Tooltip
          cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
          wrapperStyle={TIP_WRAPPER}
          isAnimationActive={false}
          content={({ active, payload }) => {
            const p = active ? (payload?.[0]?.payload as Punto | undefined) : undefined;
            if (!p) return null;
            const v = p.valor ?? NaN;
            const vsProm = Number.isFinite(v) && resumen.promedio ? ((v / resumen.promedio - 1) * 100) : NaN;
            return (
              <Tip
                titulo={p.etiqueta}
                filas={[{ nombre, valor: formato(v), color }]}
                pie={
                  <>
                    <p>{pieTip(v, sumable ? resumen.total : undefined, p.n)}</p>
                    {Number.isFinite(vsProm) && <p>{`${vsProm >= 0 ? "+" : ""}${formato(vsProm)} % vs promedio`}</p>}
                  </>
                }
              />
            );
          }}
        />
        {anotar && (
          <ReferenceLine
            y={resumen.promedio}
            stroke="var(--text-3)"
            strokeDasharray="4 4"
            strokeWidth={1}
            ifOverflow="extendDomain"
            label={{ value: `Promedio ${compacto(resumen.promedio)}`, position: "insideTopLeft", fill: "var(--text-3)", fontSize: 11 }}
          />
        )}
        <Area
          type="monotone"
          dataKey="valor"
          name={nombre}
          stroke={color}
          strokeWidth={2}
          fill={`url(#a${id})`}
          connectNulls
          isAnimationActive={animar}
          animationDuration={800}
          dot={false}
          activeDot={{ r: 5, fill: color, stroke: "var(--surface)", strokeWidth: 2 }}
        />
        {marcar && (
          <ReferenceDot
            x={resumen.max.etiqueta}
            y={resumen.max.valor}
            r={4}
            fill={color}
            stroke="var(--surface)"
            strokeWidth={2}
            label={{ value: `▲ ${compacto(resumen.max.valor)}`, position: "top", fill: "var(--text-2)", fontSize: 11, fontWeight: 600 }}
          />
        )}
        {marcar && (
          <ReferenceDot
            x={resumen.min.etiqueta}
            y={resumen.min.valor}
            r={4}
            fill={color}
            stroke="var(--surface)"
            strokeWidth={2}
            label={{ value: `▼ ${compacto(resumen.min.valor)}`, position: "bottom", fill: "var(--text-2)", fontSize: 11, fontWeight: 600 }}
          />
        )}
        {brush && puntos.length > 6 && (
          <Brush
            dataKey="etiqueta"
            height={26}
            travellerWidth={8}
            stroke="var(--border-strong)"
            fill="var(--surface-2)"
            tickFormatter={() => ""}
            onChange={(r) => {
              if (onRango && r.startIndex !== undefined && r.endIndex !== undefined) onRango({ desde: r.startIndex, hasta: r.endIndex });
            }}
          />
        )}
      </AreaChart>
    </Marco>
  );
}
