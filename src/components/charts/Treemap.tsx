"use client";

import { useMemo } from "react";
import { Tooltip, Treemap as RTreemap } from "recharts";
import { compacto, formato, type Barra } from "@/lib/calculo";
import { Marco, pieTip, Tip, TIP_WRAPPER } from "./base";
import { mezcla, useAnimar } from "./tema";

interface Nodo {
  name: string;
  size: number;
  n: number;
  [k: string]: unknown;
}

interface PropsCelda {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  depth?: number;
  name?: string;
  size?: number;
}

/**
 * Treemap de un nivel (parte del todo). Teselas en tinte suave del color de la entidad,
 * franja superior en color pleno y texto en tinta: contraste en claro y oscuro.
 * El drill-down lo maneja quien lo usa con `onSeleccionar`.
 */
export function Treemap({
  barras,
  nombre,
  etiqueta,
  colorDe,
  seleccionados,
  onSeleccionar,
  alto,
  pista,
}: {
  barras: Barra[];
  nombre: string;
  etiqueta: string;
  colorDe: (etiqueta: string) => string;
  seleccionados?: string[];
  onSeleccionar?: (etiqueta: string) => void;
  alto?: number | string;
  /** Texto de acción en el tooltip (p. ej. "Clic para ver sus sucursales"). */
  pista?: string;
}) {
  const animar = useAnimar();
  const datos = useMemo<Nodo[]>(() => barras.filter((b) => Number.isFinite(b.valor) && b.valor > 0).map((b) => ({ name: b.etiqueta, size: b.valor, n: b.n })), [barras]);
  const total = datos.reduce((s, d) => s + d.size, 0);
  const hay = (seleccionados?.length ?? 0) > 0;
  if (!datos.length) return <p className="py-10 text-center text-[13px] text-ink-3">Sin valores positivos para comparar.</p>;

  const Celda = (p: PropsCelda) => {
    const { x = 0, y = 0, width: w = 0, height: h = 0, depth, name = "", size = 0 } = p;
    if (depth !== 1 || w <= 0 || h <= 0) return <g />;
    const color = colorDe(name);
    const apagado = hay && !seleccionados!.includes(name);
    const cabe = w > 64 && h > 38;
    const cabeValor = w > 64 && h > 56;
    const pct = total ? (size / total) * 100 : 0;
    return (
      <g
        role={onSeleccionar ? "button" : undefined}
        tabIndex={onSeleccionar ? 0 : undefined}
        aria-label={`${name}: ${formato(size)}`}
        onClick={() => onSeleccionar?.(name)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSeleccionar?.(name))}
        style={{ cursor: onSeleccionar ? "pointer" : "default", opacity: apagado ? 0.4 : 1, outline: "none" }}
        className="group"
      >
        <rect x={x + 1} y={y + 1} width={Math.max(0, w - 2)} height={Math.max(0, h - 2)} rx={6} style={{ fill: mezcla("var(--surface)", color, 0.22) }} />
        <rect x={x + 1} y={y + 1} width={Math.max(0, w - 2)} height={Math.max(0, h - 2)} rx={6} style={{ fill: color }} className="opacity-0 transition-opacity group-hover:opacity-15 group-focus-visible:opacity-25" />
        <rect x={x + 1} y={y + 1} width={Math.max(0, w - 2)} height={Math.min(4, h - 2)} rx={2} style={{ fill: color }} />
        {cabe && (
          <text x={x + 10} y={y + 22} fontSize={12} fontWeight={600} style={{ fill: "var(--text)" }}>
            {name.length * 7 > w - 16 ? `${name.slice(0, Math.max(1, Math.floor((w - 16) / 7) - 1))}…` : name}
          </text>
        )}
        {cabeValor && (
          <text x={x + 10} y={y + 40} fontSize={11} style={{ fill: "var(--text-2)" }} className="num">
            {compacto(size)} · {pct.toFixed(pct < 10 ? 1 : 0).replace(".", ",")} %
          </text>
        )}
      </g>
    );
  };

  return (
    <Marco etiqueta={etiqueta} alto={alto ?? 340}>
      <RTreemap data={datos} dataKey="size" nameKey="name" aspectRatio={4 / 3} isAnimationActive={animar} animationDuration={500} content={<Celda />}>
        <Tooltip
          wrapperStyle={TIP_WRAPPER}
          isAnimationActive={false}
          content={({ active, payload }) => {
            const d = active ? (payload?.[0]?.payload as Nodo | undefined) : undefined;
            if (!d) return null;
            return (
              <Tip
                titulo={d.name}
                filas={[{ nombre, valor: formato(d.size), color: colorDe(d.name) }]}
                pie={
                  <>
                    <p>{pieTip(d.size, total, d.n)}</p>
                    {pista && <p className="text-accent">{pista}</p>}
                  </>
                }
              />
            );
          }}
        />
      </RTreemap>
    </Marco>
  );
}
