"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { compacto, formato } from "@/lib/calculo";
import { CURSOR, EJE, GRILLA, Leyenda, Marco, Tip, TIP_WRAPPER } from "./base";
import { porcentaje, useAnimar } from "./tema";

export interface SerieApilada {
  nombre: string;
  color: string;
  datos: number[];
}

/** Columnas apiladas (valores absolutos o 100 %). Colores siempre por entidad. */
export function ApiladoComposicion({
  etiquetas,
  series,
  modo = "apilado",
  etiqueta,
  alto,
  unidad = "registros",
}: {
  etiquetas: string[];
  series: SerieApilada[];
  modo?: "apilado" | "100";
  etiqueta: string;
  alto?: number | string;
  unidad?: string;
}) {
  const animar = useAnimar();
  const [ocultas, setOcultas] = useState<string[]>([]);
  const visibles = series.filter((s) => !ocultas.includes(s.nombre));
  const datos = useMemo(
    () =>
      etiquetas.map((e, i) => {
        const fila: Record<string, number | string> = { etiqueta: e };
        let total = 0;
        for (const s of visibles) total += s.datos[i] ?? 0;
        for (const s of visibles) fila[s.nombre] = modo === "100" ? (total ? ((s.datos[i] ?? 0) / total) * 100 : 0) : s.datos[i] ?? 0;
        fila.__total = total;
        return fila;
      }),
    [etiquetas, visibles, modo],
  );
  const alternar = (n: string) => setOcultas((o) => (o.includes(n) ? o.filter((x) => x !== n) : o.length + 1 < series.length ? [...o, n] : o));

  return (
    <div>
      <Leyenda items={series} onClick={alternar} activos={series.filter((s) => !ocultas.includes(s.nombre)).map((s) => s.nombre)} />
      <Marco etiqueta={etiqueta} alto={alto}>
        <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="18%">
          <CartesianGrid {...GRILLA} />
          <XAxis dataKey="etiqueta" {...EJE} minTickGap={16} tickMargin={8} />
          <YAxis {...EJE} width={44} domain={modo === "100" ? [0, 100] : [0, "auto"]} tickFormatter={(v: number) => (modo === "100" ? `${v} %` : compacto(v))} />
          <Tooltip
            cursor={CURSOR}
            wrapperStyle={TIP_WRAPPER}
            isAnimationActive={false}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const fila = payload[0].payload as Record<string, number>;
              const i = etiquetas.indexOf(String(label));
              return (
                <Tip
                  titulo={label}
                  filas={[...visibles]
                    .reverse()
                    .map((s) => {
                      const v = s.datos[i] ?? 0;
                      return { nombre: s.nombre, color: s.color, valor: modo === "100" ? porcentaje(fila[s.nombre] ?? 0) : formato(v) };
                    })}
                  pie={`Total ${formato(fila.__total)} ${unidad}`}
                />
              );
            }}
          />
          {visibles.map((s, k) => (
            <Bar
              key={s.nombre}
              dataKey={s.nombre}
              stackId="a"
              fill={s.color}
              stroke="var(--surface)"
              strokeWidth={1}
              maxBarSize={28}
              radius={k === visibles.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={animar}
              animationDuration={600}
            />
          ))}
        </BarChart>
      </Marco>
    </div>
  );
}

export interface Segmento {
  nombre: string;
  valor: number;
  color: string;
  /** Ícono + texto (p. ej. <Estado/>) para no depender solo del color. */
  rotulo?: React.ReactNode;
}

/** Una sola barra 100 % segmentada (composición de estados). Clic = filtro cruzado. */
export function BarraComposicion({
  segmentos,
  etiqueta,
  seleccionados,
  onSeleccionar,
}: {
  segmentos: Segmento[];
  etiqueta: string;
  seleccionados?: string[];
  onSeleccionar?: (nombre: string) => void;
}) {
  const animar = useAnimar();
  const [activo, setActivo] = useState<string | null>(null);
  const total = segmentos.reduce((s, x) => s + x.valor, 0);
  const hay = (seleccionados?.length ?? 0) > 0;
  if (!total) return null;
  const foco = segmentos.find((s) => s.nombre === activo);
  return (
    <div>
      <div className="flex h-9 w-full gap-[2px] overflow-hidden rounded-[8px]" role="group" aria-label={etiqueta}>
        {segmentos.map((s) => {
          const pct = (s.valor / total) * 100;
          const apagado = hay && !seleccionados!.includes(s.nombre);
          return (
            <motion.button
              key={s.nombre}
              type="button"
              className="h-full min-w-[3px] first:rounded-l-[8px] last:rounded-r-[8px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              style={{ background: s.color, opacity: apagado ? 0.3 : 1, cursor: onSeleccionar ? "pointer" : "default" }}
              initial={animar ? { width: 0 } : false}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              onMouseEnter={() => setActivo(s.nombre)}
              onMouseLeave={() => setActivo(null)}
              onFocus={() => setActivo(s.nombre)}
              onBlur={() => setActivo(null)}
              onClick={() => onSeleccionar?.(s.nombre)}
              aria-pressed={onSeleccionar ? seleccionados?.includes(s.nombre) ?? false : undefined}
              aria-label={`${s.nombre}: ${formato(s.valor)} (${porcentaje(pct)})`}
            />
          );
        })}
      </div>
      <p className="mt-2 min-h-5 text-[12px] text-ink-3" aria-live="polite">
        {foco ? (
          <>
            <strong className="font-semibold text-ink">{foco.nombre}</strong> · {formato(foco.valor)} · {porcentaje((foco.valor / total) * 100)} del total
          </>
        ) : (
          "Pasa el cursor por un segmento para ver su detalle"
        )}
      </p>
      <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {segmentos.map((s) => (
          <li key={s.nombre} className="flex items-center justify-between gap-2 text-[12px]">
            <span className="inline-flex min-w-0 items-center gap-1.5">{s.rotulo ?? s.nombre}</span>
            <span className="num shrink-0 text-ink-2">
              {formato(s.valor)} <span className="text-ink-3">· {porcentaje((s.valor / total) * 100)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
