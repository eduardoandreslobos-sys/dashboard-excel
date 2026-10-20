"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Tooltip, XAxis, YAxis } from "recharts";
import { compacto, formato, type Barra } from "@/lib/calculo";
import { CURSOR, EJE, Marco, pieTip, Tip, TIP_WRAPPER } from "./base";
import { useAnimar } from "./tema";

const corta = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Ranking horizontal. Con `onSeleccionar`, clic en una barra = filtro cruzado;
 * las barras no seleccionadas se atenúan.
 */
export function BarrasRanking({
  barras,
  nombre,
  etiqueta,
  seleccionados,
  onSeleccionar,
  colorDe,
  sumable = true,
  alto,
  formatoValor = formato,
}: {
  barras: Barra[];
  nombre: string;
  etiqueta?: string;
  seleccionados?: string[];
  onSeleccionar?: (etiqueta: string) => void;
  /** Color por entidad (p. ej. tonos de estado). Por defecto un solo tono. */
  colorDe?: (etiqueta: string) => string;
  sumable?: boolean;
  alto?: number;
  formatoValor?: (v: number) => string;
}) {
  const animar = useAnimar();
  const total = useMemo(() => (sumable ? barras.reduce((s, b) => s + (Number.isFinite(b.valor) ? b.valor : 0), 0) : undefined), [barras, sumable]);
  const anchoEje = useMemo(() => Math.min(150, Math.max(56, Math.max(0, ...barras.map((b) => Math.min(22, b.etiqueta.length))) * 6.4 + 8)), [barras]);
  const hay = (seleccionados?.length ?? 0) > 0;
  if (!barras.length) return <p className="py-10 text-center text-[13px] text-ink-3">Sin datos con los filtros actuales.</p>;

  return (
    <>
      <Marco etiqueta={etiqueta ?? `${nombre} por categoría`} alto={alto ?? Math.max(140, barras.length * 32 + 16)}>
        <BarChart data={barras} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap={6}>
          <CartesianGrid stroke="var(--grid)" horizontal={false} />
          <XAxis type="number" hide domain={[0, "auto"]} />
          <YAxis type="category" dataKey="etiqueta" {...EJE} width={anchoEje} interval={0} tick={{ ...EJE.tick, fill: "var(--text-2)" }} tickFormatter={(s: string) => corta(s, 22)} />
          <Tooltip
            cursor={CURSOR}
            wrapperStyle={TIP_WRAPPER}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const b = active ? (payload?.[0]?.payload as Barra | undefined) : undefined;
              if (!b) return null;
              return (
                <Tip
                  titulo={b.etiqueta}
                  filas={[{ nombre, valor: formatoValor(b.valor), color: colorDe?.(b.etiqueta) ?? "var(--s1)" }]}
                  pie={
                    <>
                      <p>{pieTip(b.valor, total, b.n)}</p>
                      {onSeleccionar && <p className="text-accent">{seleccionados?.includes(b.etiqueta) ? "Clic para quitar el filtro" : "Clic para filtrar el dashboard"}</p>}
                    </>
                  }
                />
              );
            }}
          />
          <Bar
            dataKey="valor"
            name={nombre}
            maxBarSize={22}
            radius={[0, 4, 4, 0]}
            isAnimationActive={animar}
            animationDuration={600}
            cursor={onSeleccionar ? "pointer" : undefined}
            onClick={onSeleccionar ? (d: { payload?: Barra }) => d.payload && onSeleccionar(d.payload.etiqueta) : undefined}
          >
            {barras.map((b) => (
              <Cell
                key={b.etiqueta}
                fill={colorDe?.(b.etiqueta) ?? "var(--s1)"}
                fillOpacity={hay && !seleccionados!.includes(b.etiqueta) ? 0.28 : 1}
                style={{ transition: "fill-opacity 200ms ease-out" }}
              />
            ))}
            <LabelList dataKey="valor" position="right" offset={6} fill="var(--text-2)" fontSize={11} formatter={(v: unknown) => compacto(Number(v))} />
          </Bar>
        </BarChart>
      </Marco>
      {onSeleccionar && (
        <ul className="sr-only" aria-label={`Filtrar por ${nombre}`}>
          {barras.map((b) => (
            <li key={b.etiqueta}>
              <button type="button" aria-pressed={seleccionados?.includes(b.etiqueta) ?? false} onClick={() => onSeleccionar(b.etiqueta)}>
                {`${b.etiqueta}: ${formatoValor(b.valor)}`}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
