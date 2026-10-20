"use client";

import { useMemo } from "react";
import { CartesianGrid, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { compacto, formato } from "@/lib/calculo";
import { EJE, Leyenda, Marco, Tip, TIP_WRAPPER } from "./base";
import { useAnimar } from "./tema";

export interface SerieDispersion {
  nombre: string;
  color: string;
  puntos: [number, number][];
}

const MAXIMO = 3000;

/** Dispersión X–Y. Si hay más de 3000 puntos se muestrea de forma pareja (y se avisa). */
export function Dispersion({ series, x, y, etiqueta, alto = 360 }: { series: SerieDispersion[]; x: string; y: string; etiqueta?: string; alto?: number }) {
  const animar = useAnimar();
  const total = series.reduce((s, x) => s + x.puntos.length, 0);
  const paso = total > MAXIMO ? Math.ceil(total / MAXIMO) : 1;
  const datos = useMemo(
    () =>
      series.map((s) => ({
        ...s,
        datos: s.puntos.filter((p, i) => i % paso === 0 && Number.isFinite(p[0]) && Number.isFinite(p[1])).map(([a, b]) => ({ x: a, y: b })),
      })),
    [series, paso],
  );
  const mostrados = datos.reduce((s, d) => s + d.datos.length, 0);

  return (
    <div>
      <Leyenda items={series} />
      <Marco etiqueta={etiqueta ?? `${y} versus ${x}`} alto={alto}>
        <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" />
          <XAxis type="number" dataKey="x" name={x} {...EJE} domain={["auto", "auto"]} tickFormatter={(v: number) => compacto(v)} label={{ value: x, position: "insideBottomRight", offset: -4, fill: "var(--text-3)", fontSize: 11 }} />
          <YAxis type="number" dataKey="y" name={y} {...EJE} width={52} domain={["auto", "auto"]} tickFormatter={(v: number) => compacto(v)} />
          <ZAxis range={[28, 28]} />
          <Tooltip
            cursor={{ stroke: "var(--border-strong)", strokeDasharray: "3 3" }}
            wrapperStyle={TIP_WRAPPER}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as { x: number; y: number } | undefined) : undefined;
              if (!p) return null;
              const s = datos.find((d) => d.datos.includes(p as { x: number; y: number }));
              return (
                <Tip
                  titulo={s && series.length > 1 ? s.nombre : "Registro"}
                  filas={[
                    { nombre: x, valor: formato(p.x), color: s?.color },
                    { nombre: y, valor: formato(p.y) },
                  ]}
                />
              );
            }}
          />
          {datos.map((s) => (
            <Scatter key={s.nombre} name={s.nombre} data={s.datos} fill={s.color} fillOpacity={0.6} isAnimationActive={animar && mostrados < 1500} animationDuration={500} />
          ))}
        </ScatterChart>
      </Marco>
      {paso > 1 && <p className="mt-1 text-[11px] text-ink-3">Se muestran {formato(mostrados)} de {formato(total)} registros (muestra pareja, 1 de cada {paso}).</p>}
    </div>
  );
}
