"use client";

import { useSyncExternalStore } from "react";
import { useReducedMotion } from "motion/react";
import { columna, type Tabla, type Tono } from "@/lib/analisis";
import { texto } from "@/lib/calculo";

/** Color categórico fijo por posición (1..8). Nunca se cicla: el 9.º valor va a "Otros". */
export const serie = (i: number) => `var(--s${Math.min(7, Math.max(0, i)) + 1})`;

export const COLOR_ESTADO: Record<Tono, string> = {
  bueno: "var(--ok)",
  alerta: "var(--warn)",
  serio: "var(--serious)",
  critico: "var(--critical)",
  neutro: "var(--neutral)",
};

export const OTROS = "Otros";
export const COLOR_OTROS = "var(--neutral)";

/**
 * Color por entidad: tono semántico si la columna es de estado; si no, posición fija
 * según el orden alfabético de TODOS los valores de la tabla (un filtro no repinta).
 */
export function colorPorEntidad(tabla: Tabla, cat: string): (valor: string) => string {
  const tonos = columna(tabla, cat)?.tonos;
  if (tonos) return (v) => COLOR_ESTADO[tonos[v] ?? "neutro"];
  const orden = [...new Set(tabla.filas.map((f) => texto(f[cat])))].sort();
  return (v) => {
    const i = orden.indexOf(v);
    return i < 0 || i >= 8 || v === OTROS ? COLOR_OTROS : serie(i);
  };
}

// ---------------------------------------------------------------- tema y movimiento

function suscribir(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-density"] });
  const mq = matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => {
    obs.disconnect();
    mq.removeEventListener("change", cb);
  };
}

function esOscuro() {
  const t = document.documentElement.dataset.theme;
  return t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
}

/** true en modo oscuro (atributo data-theme o preferencia del sistema). */
export function useOscuro(): boolean {
  return useSyncExternalStore(suscribir, esOscuro, () => false);
}

/** Animaciones de los gráficos: apagadas si el usuario pidió reducir movimiento. */
export function useAnimar(): boolean {
  return !useReducedMotion();
}

// ---------------------------------------------------------------- formato

const pct = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });
export const porcentaje = (v: number) => `${pct.format(v)} %`;

/** Mezcla dos colores CSS (sirve con variables): t = 0 → a, t = 1 → b. */
export const mezcla = (a: string, b: string, t: number) =>
  `color-mix(in oklab, ${a}, ${b} ${Math.round(Math.max(0, Math.min(1, t)) * 100)}%)`;
