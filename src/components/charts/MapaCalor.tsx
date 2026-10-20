"use client";

import { useMemo } from "react";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleBand } from "@visx/scale";
import { TooltipWithBounds, useTooltip } from "@visx/tooltip";
import { formato } from "@/lib/calculo";
import { pieTip, Tip } from "./base";
import { mezcla, useOscuro } from "./tema";

export interface Celda {
  /** Índice en `xs`. */
  x: number;
  /** Índice en `ys`. */
  y: number;
  valor: number;
  n?: number;
}

const corta = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s);

/**
 * Mapa de calor con visx. `divergente` (−1…1, gris neutro al centro) para correlaciones;
 * `secuencial` (un solo tono, claro → oscuro) para cruces de categorías.
 */
export function MapaCalor({
  xs,
  ys,
  celdas,
  tipo,
  nombre,
  etiqueta,
  formatoValor = formato,
  sumable = false,
}: {
  xs: string[];
  ys: string[];
  celdas: Celda[];
  tipo: "divergente" | "secuencial";
  nombre: string;
  etiqueta: string;
  formatoValor?: (v: number) => string;
  sumable?: boolean;
}) {
  const anchoY = Math.min(150, Math.max(40, Math.max(0, ...ys.map((y) => Math.min(20, y.length))) * 6.6 + 10));
  const altoCelda = 36;
  const alto = ys.length * altoCelda + 30;
  const minimo = anchoY + xs.length * 44;
  return (
    <figure aria-label={etiqueta} className="m-0 w-full overflow-x-auto">
      <div style={{ minWidth: minimo, height: alto }}>
        <ParentSize debounceTime={50}>
          {({ width }) =>
            width > 0 ? (
              <Lienzo {...{ xs, ys, celdas, tipo, nombre, formatoValor, sumable, anchoY, altoCelda, width, height: alto }} />
            ) : null
          }
        </ParentSize>
      </div>
      <Escala tipo={tipo} celdas={celdas} formatoValor={formatoValor} />
    </figure>
  );
}

function Lienzo({
  xs,
  ys,
  celdas,
  tipo,
  nombre,
  formatoValor,
  sumable,
  anchoY,
  altoCelda,
  width,
  height,
}: {
  xs: string[];
  ys: string[];
  celdas: Celda[];
  tipo: "divergente" | "secuencial";
  nombre: string;
  formatoValor: (v: number) => string;
  sumable: boolean;
  anchoY: number;
  altoCelda: number;
  width: number;
  height: number;
}) {
  const oscuro = useOscuro();
  const { tooltipOpen, tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } = useTooltip<Celda>();
  const ancho = width - anchoY;
  const sx = useMemo(() => scaleBand<number>({ domain: xs.map((_, i) => i), range: [0, ancho], padding: 0.04 }), [xs, ancho]);
  const sy = useMemo(() => scaleBand<number>({ domain: ys.map((_, i) => i), range: [0, ys.length * altoCelda], padding: 0.06 }), [ys, altoCelda]);
  const finitos = celdas.map((c) => c.valor).filter(Number.isFinite);
  const min = Math.min(...finitos);
  const max = Math.max(...finitos);
  const total = sumable ? finitos.reduce((a, b) => a + b, 0) : undefined;

  const intensidad = (v: number) => (tipo === "divergente" ? Math.min(1, Math.abs(v)) : max > min ? (v - min) / (max - min) : 1);
  const relleno = (v: number) => {
    if (!Number.isFinite(v)) return "var(--surface-2)";
    if (tipo === "divergente") return mezcla("var(--div-mid)", v < 0 ? "var(--div-neg)" : "var(--div-pos)", Math.min(1, Math.abs(v)));
    return mezcla("var(--seq-0)", "var(--seq-4)", 0.08 + intensidad(v) * 0.92);
  };
  const tinta = (v: number) => {
    const t = intensidad(v);
    if (tipo === "divergente") return !oscuro && t > 0.55 ? "#ffffff" : "var(--text)";
    return oscuro ? (t > 0.62 ? "#0b0d10" : "var(--text)") : t > 0.5 ? "#ffffff" : "var(--text)";
  };
  const bw = sx.bandwidth();
  const bh = sy.bandwidth();
  const caracteres = Math.floor(bw / 6.4);

  return (
    <div className="relative">
      <svg width={width} height={height} role="presentation">
        <Group left={anchoY}>
          {celdas.map((c) => {
            const x = sx(c.x) ?? 0;
            const y = sy(c.y) ?? 0;
            const txt = formatoValor(c.valor);
            return (
              <g key={`${c.x}-${c.y}`}>
                <rect
                  x={x}
                  y={y}
                  width={bw}
                  height={bh}
                  rx={4}
                  style={{ fill: relleno(c.valor) }}
                  onMouseMove={() => showTooltip({ tooltipData: c, tooltipLeft: anchoY + x + bw / 2, tooltipTop: y + bh / 2 })}
                  onMouseLeave={hideTooltip}
                >
                  <title>{`${ys[c.y]} × ${xs[c.x]}: ${txt}`}</title>
                </rect>
                {bw >= 34 && bh >= 22 && txt.length <= caracteres && (
                  <text x={x + bw / 2} y={y + bh / 2} dy="0.35em" textAnchor="middle" fontSize={11} fontWeight={500} className="num pointer-events-none" style={{ fill: tinta(c.valor) }}>
                    {txt}
                  </text>
                )}
              </g>
            );
          })}
          {xs.map((x, i) => (
            <text key={x} x={(sx(i) ?? 0) + bw / 2} y={ys.length * altoCelda + 16} textAnchor="middle" fontSize={11} style={{ fill: "var(--text-3)" }}>
              <title>{x}</title>
              {corta(x, Math.max(3, caracteres))}
            </text>
          ))}
        </Group>
        {ys.map((y, i) => (
          <text key={y} x={anchoY - 8} y={(sy(i) ?? 0) + bh / 2} dy="0.35em" textAnchor="end" fontSize={11} style={{ fill: "var(--text-2)" }}>
            <title>{y}</title>
            {corta(y, 20)}
          </text>
        ))}
      </svg>
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds left={tooltipLeft} top={tooltipTop} unstyled applyPositionStyle style={{ position: "absolute", pointerEvents: "none", zIndex: 20 }}>
          <Tip
            titulo={`${ys[tooltipData.y]} × ${xs[tooltipData.x]}`}
            filas={[{ nombre, valor: formatoValor(tooltipData.valor), color: relleno(tooltipData.valor) }]}
            pie={pieTip(tooltipData.valor, total, tooltipData.n)}
          />
        </TooltipWithBounds>
      )}
    </div>
  );
}

/** Escala de color bajo el mapa (con extremos rotulados). */
function Escala({ tipo, celdas, formatoValor }: { tipo: "divergente" | "secuencial"; celdas: Celda[]; formatoValor: (v: number) => string }) {
  const finitos = celdas.map((c) => c.valor).filter(Number.isFinite);
  if (!finitos.length) return null;
  const fondo =
    tipo === "divergente"
      ? "linear-gradient(90deg, var(--div-neg), var(--div-mid), var(--div-pos))"
      : `linear-gradient(90deg, ${mezcla("var(--seq-0)", "var(--seq-4)", 0.08)}, var(--seq-4))`;
  const [a, b] = tipo === "divergente" ? ["−1 (opuestas)", "+1 (suben juntas)"] : [formatoValor(Math.min(...finitos)), formatoValor(Math.max(...finitos))];
  return (
    <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-3" aria-hidden>
      <span className="num">{a}</span>
      <span className="h-2 max-w-[220px] flex-1 rounded-full" style={{ background: fondo }} />
      <span className="num">{b}</span>
      {tipo === "divergente" && <span className="ml-1">· 0 = sin relación</span>}
    </div>
  );
}
