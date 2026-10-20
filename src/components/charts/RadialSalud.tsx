"use client";

import NumberFlow from "@number-flow/react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import type { Tono } from "@/lib/analisis";
import { formato } from "@/lib/calculo";
import { Estado } from "../ui";
import { Marco, Tip, TIP_WRAPPER } from "./base";
import { COLOR_ESTADO, porcentaje, useAnimar } from "./tema";

export interface GrupoSalud {
  tono: Tono;
  /** Valores de la columna de estado que caen en este tono. */
  valores: string[];
  n: number;
}

const ORDEN: Tono[] = ["bueno", "alerta", "serio", "critico", "neutro"];
const NOMBRE: Record<Tono, string> = { bueno: "Al día", alerta: "En seguimiento", serio: "En riesgo", critico: "Crítico", neutro: "Sin clasificar" };

/** Anillo de salud: % al día al centro y el resto por tono de estado (siempre con ícono + texto). */
export function RadialSalud({ grupos, etiqueta, onSeleccionar }: { grupos: GrupoSalud[]; etiqueta: string; onSeleccionar?: (valores: string[]) => void }) {
  const animar = useAnimar();
  const datos = ORDEN.map((t) => grupos.find((g) => g.tono === t)).filter((g): g is GrupoSalud => !!g && g.n > 0);
  const total = datos.reduce((s, g) => s + g.n, 0);
  if (!total) return null;
  const alDia = ((datos.find((g) => g.tono === "bueno")?.n ?? 0) / total) * 100;
  const riesgo = (datos.filter((g) => g.tono === "serio" || g.tono === "critico").reduce((s, g) => s + g.n, 0) / total) * 100;

  return (
    <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[minmax(0,200px)_1fr]">
      <div className="relative mx-auto aspect-square w-full max-w-[200px]">
        <Marco etiqueta={etiqueta} alto="100%">
          <PieChart>
            <Tooltip
              wrapperStyle={TIP_WRAPPER}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const g = active ? (payload?.[0]?.payload as GrupoSalud | undefined) : undefined;
                if (!g) return null;
                return (
                  <Tip
                    titulo={NOMBRE[g.tono]}
                    filas={[{ nombre: g.valores.join(" / "), valor: formato(g.n), color: COLOR_ESTADO[g.tono] }]}
                    pie={`${porcentaje((g.n / total) * 100)} de ${formato(total)} registros`}
                  />
                );
              }}
            />
            <Pie
              data={datos}
              dataKey="n"
              nameKey="tono"
              innerRadius="74%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={datos.length > 1 ? 2 : 0}
              cornerRadius={4}
              stroke="none"
              isAnimationActive={animar}
              animationDuration={800}
              cursor={onSeleccionar ? "pointer" : undefined}
              onClick={onSeleccionar ? (d: { payload?: GrupoSalud }) => d.payload && onSeleccionar(d.payload.valores) : undefined}
            >
              {datos.map((g) => (
                <Cell key={g.tono} fill={COLOR_ESTADO[g.tono]} />
              ))}
            </Pie>
          </PieChart>
        </Marco>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-[30px] font-semibold leading-none tracking-tight text-ink">
              <NumberFlow value={alDia} format={{ maximumFractionDigits: 1 }} suffix=" %" locales="es-CL" animated={animar} />
            </p>
            <p className="mt-1 text-[11px] text-ink-3">al día</p>
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-[13px] text-ink-2">
          <strong className="font-semibold text-ink">{porcentaje(riesgo)}</strong> de la cartera está en riesgo o crítico.
        </p>
        <ul className="flex flex-col gap-1.5">
          {datos.map((g) => (
            <li key={g.tono} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="inline-flex min-w-0 flex-wrap gap-1">
                {g.valores.map((v) => (
                  <Estado key={v} tono={g.tono} texto={v} />
                ))}
              </span>
              <span className="num shrink-0 text-ink-2">
                {formato(g.n)} <span className="text-ink-3">· {porcentaje((g.n / total) * 100)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
