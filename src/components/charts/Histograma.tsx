"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { compacto, formato, histograma } from "@/lib/calculo";
import { CURSOR, EJE, GRILLA, Marco, Tip, TIP_WRAPPER } from "./base";
import { porcentaje, useAnimar } from "./tema";

/** Histograma de una medida continua con el promedio marcado. */
export function Histograma({ valores, nombre, alto = 220, cubetas = 24 }: { valores: number[]; nombre: string; alto?: number; cubetas?: number }) {
  const animar = useAnimar();
  const datos = useMemo(() => histograma(valores, cubetas).map((c) => ({ ...c, medio: (c.desde + c.hasta) / 2, etiqueta: compacto(c.desde) })), [valores, cubetas]);
  const finitos = valores.filter(Number.isFinite);
  const promedio = finitos.reduce((a, b) => a + b, 0) / (finitos.length || 1);
  if (!datos.length) return <p className="py-10 text-center text-[13px] text-ink-3">Sin valores numéricos.</p>;
  // Índice de la cubeta que contiene el promedio (eje de categorías).
  const iProm = datos.findIndex((c) => promedio >= c.desde && promedio <= c.hasta);

  return (
    <Marco etiqueta={`Distribución de ${nombre}`} alto={alto}>
      <BarChart data={datos} margin={{ top: 18, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
        <CartesianGrid {...GRILLA} />
        <XAxis dataKey="etiqueta" {...EJE} minTickGap={18} tickMargin={6} />
        <YAxis {...EJE} width={40} allowDecimals={false} tickFormatter={(v: number) => compacto(v)} />
        <Tooltip
          cursor={CURSOR}
          wrapperStyle={TIP_WRAPPER}
          isAnimationActive={false}
          content={({ active, payload }) => {
            const c = active ? (payload?.[0]?.payload as (typeof datos)[number] | undefined) : undefined;
            if (!c) return null;
            return (
              <Tip
                titulo={`${formato(c.desde)} – ${formato(c.hasta)}`}
                filas={[{ nombre: "Registros", valor: formato(c.n), color: "var(--s1)" }]}
                pie={`${porcentaje((c.n / (finitos.length || 1)) * 100)} del total`}
              />
            );
          }}
        />
        {iProm >= 0 && (
          <ReferenceLine
            x={datos[iProm].etiqueta}
            stroke="var(--text-3)"
            strokeDasharray="4 4"
            label={{ value: `Promedio ${compacto(promedio)}`, position: "top", fill: "var(--text-3)", fontSize: 11 }}
          />
        )}
        <Bar dataKey="n" name="Registros" fill="var(--s1)" radius={[4, 4, 0, 0]} isAnimationActive={animar} animationDuration={600} />
      </BarChart>
    </Marco>
  );
}
