"use client";

import type { CSSProperties, ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import { formato } from "@/lib/calculo";
import { porcentaje } from "./tema";

/** Contenedor común: tamaño fijo en alto, ancho fluido y nombre accesible. */
export function Marco({ etiqueta, alto, children, className = "" }: { etiqueta: string; alto?: number | string; children: ReactNode; className?: string }) {
  return (
    <figure aria-label={etiqueta} className={`relative m-0 w-full min-w-0 ${className}`} style={{ height: alto ?? "var(--chart-h)" }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 320, height: 200 }}>
        {children as React.ReactElement}
      </ResponsiveContainer>
    </figure>
  );
}

export interface FilaTip {
  nombre: string;
  valor: string;
  color?: string;
  /** Texto secundario a la derecha (p. ej. "12,4 % del total"). */
  extra?: string;
}

/** Caja de tooltip enriquecida, igual en todos los gráficos. */
export function Tip({ titulo, filas, pie }: { titulo?: ReactNode; filas: FilaTip[]; pie?: ReactNode }) {
  return (
    <div
      className="pointer-events-none min-w-[160px] max-w-[280px] rounded-[10px] border border-line bg-surface px-3 py-2 text-[12px] text-ink-2"
      style={{ boxShadow: "var(--shadow-pop)" }}
    >
      {titulo && <p className="mb-1.5 font-semibold text-ink">{titulo}</p>}
      <ul className="flex flex-col gap-1">
        {filas.map((f) => (
          <li key={f.nombre} className="flex items-center gap-2">
            {f.color && <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: f.color }} aria-hidden />}
            <span className="min-w-0 flex-1 truncate">{f.nombre}</span>
            <span className="num font-medium text-ink">{f.valor}</span>
          </li>
        ))}
      </ul>
      {(pie || filas.some((f) => f.extra)) && (
        <div className="mt-1.5 border-t border-line pt-1.5 text-[11px] text-ink-3">
          {filas.filter((f) => f.extra).map((f) => (
            <p key={f.nombre}>{f.extra}</p>
          ))}
          {pie}
        </div>
      )}
    </div>
  );
}

/** Pie estándar: participación y número de registros. */
export function pieTip(valor: number, total: number | undefined, n: number | undefined) {
  const partes = [];
  if (total && Number.isFinite(valor) && total > 0) partes.push(`${porcentaje((valor / total) * 100)} del total`);
  if (n !== undefined) partes.push(`${formato(n)} ${n === 1 ? "registro" : "registros"}`);
  return partes.length ? partes.join(" · ") : undefined;
}

/** Leyenda HTML (solo para 2+ series): muestra + texto en tinta, nunca texto coloreado. */
export function Leyenda({ items, onClick, activos }: { items: { nombre: string; color: string }[]; onClick?: (nombre: string) => void; activos?: string[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-2" aria-label="Leyenda">
      {items.map((it) => {
        const apagado = activos?.length ? !activos.includes(it.nombre) : false;
        const contenido = (
          <>
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: it.color }} aria-hidden />
            {it.nombre}
          </>
        );
        return (
          <li key={it.nombre} style={{ opacity: apagado ? 0.45 : 1 } as CSSProperties}>
            {onClick ? (
              <button type="button" className="inline-flex items-center gap-1.5 hover:text-ink" aria-pressed={!apagado} onClick={() => onClick(it.nombre)}>
                {contenido}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5">{contenido}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Ejes y grilla discretos (hairline sólida, texto en tinta tenue). */
export const EJE = {
  tick: { fill: "var(--text-3)", fontSize: 11 },
  axisLine: false,
  tickLine: false,
} as const;
export const GRILLA = { stroke: "var(--grid)", strokeDasharray: undefined, vertical: false } as const;
export const CURSOR = { fill: "var(--surface-hover)", opacity: 0.8 } as const;
export const TIP_WRAPPER: CSSProperties = { outline: "none", zIndex: 20 };
