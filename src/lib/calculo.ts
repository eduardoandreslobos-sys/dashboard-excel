import { agregacionDe, type Fila, type Tabla, type Valor } from "./analisis";

export type Calculo = "sum" | "mean" | "count" | "max" | "min" | "median";
export type Periodo = "dia" | "semana" | "mes" | "trimestre" | "anio";

export const PERIODOS: Record<Periodo, string> = {
  dia: "Día",
  semana: "Semana",
  mes: "Mes",
  trimestre: "Trimestre",
  anio: "Año",
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// ---------------------------------------------------------------- formato es-CL

const fmtEntero = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const fmtDecimal = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCompacto = new Intl.NumberFormat("es-CL", { notation: "compact", maximumFractionDigits: 1 });

export function formato(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (Math.abs(v) < 0.005) v = 0; // evita "-0"
  if (Math.abs(v) >= 1e6) return `${fmtDecimal.format(v / 1e6)} M`;
  if (Number.isInteger(v) || Math.abs(v) >= 1000) return fmtEntero.format(v);
  return fmtDecimal.format(v);
}

export function compacto(v: number): string {
  if (Math.abs(v) < 1000) return Number.isInteger(v) ? String(v) : fmtDecimal.format(v);
  return fmtCompacto.format(v);
}

export function fechaCorta(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`;
}

export function mesLargo(d: Date): string {
  return `${MESES_LARGOS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function etiquetaPeriodo(d: Date, p: Periodo): string {
  const y = d.getUTCFullYear();
  switch (p) {
    case "dia":
    case "semana":
      return `${String(d.getUTCDate()).padStart(2, "0")} ${MESES[d.getUTCMonth()]}`;
    case "mes":
      return `${MESES[d.getUTCMonth()]} ${String(y).slice(2)}`;
    case "trimestre":
      return `T${Math.floor(d.getUTCMonth() / 3) + 1} ${y}`;
    case "anio":
      return String(y);
  }
}

export const texto = (v: Valor): string =>
  v === null ? "(vacío)" : v instanceof Date ? fechaCorta(v) : typeof v === "number" ? formato(v) : v;

// ---------------------------------------------------------------- agregación

export function calcular(valores: number[], c: Calculo): number {
  const n = valores.filter((v) => v !== null && !Number.isNaN(v));
  if (c === "count") return valores.length;
  if (!n.length) return NaN;
  switch (c) {
    case "sum":
      return n.reduce((a, b) => a + b, 0);
    case "mean":
      return n.reduce((a, b) => a + b, 0) / n.length;
    case "max":
      return Math.max(...n);
    case "min":
      return Math.min(...n);
    case "median": {
      const s = [...n].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
  }
}

/** Valor de la medida (o el conteo, si medida es null) para un conjunto de filas. */
export function valorDe(tabla: Tabla, filas: Fila[], medida: string | null, c?: Calculo): number {
  if (!medida) return filas.length;
  return calcular(
    filas.map((f) => f[medida] as number).filter((v) => typeof v === "number"),
    c ?? agregacionDe(tabla, medida),
  );
}

export function agrupar(filas: Fila[], clave: (f: Fila) => string): Map<string, Fila[]> {
  const grupos = new Map<string, Fila[]>();
  for (const f of filas) {
    const k = clave(f);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(f);
  }
  return grupos;
}

export interface Barra {
  etiqueta: string;
  valor: number;
  n: number;
}

export function porCategoria(tabla: Tabla, filas: Fila[], cat: string, medida: string | null, c?: Calculo): Barra[] {
  return [...agrupar(filas, (f) => texto(f[cat]))]
    .map(([etiqueta, grupo]) => ({ etiqueta, valor: valorDe(tabla, grupo, medida, c), n: grupo.length }))
    .sort((a, b) => b.valor - a.valor);
}

export function inicioPeriodo(d: Date, p: Periodo): number {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (p) {
    case "dia":
      return Date.UTC(y, m, d.getUTCDate());
    case "semana": {
      const dia = (d.getUTCDay() + 6) % 7; // lunes = 0
      return Date.UTC(y, m, d.getUTCDate() - dia);
    }
    case "mes":
      return Date.UTC(y, m, 1);
    case "trimestre":
      return Date.UTC(y, m - (m % 3), 1);
    case "anio":
      return Date.UTC(y, 0, 1);
  }
}

function siguiente(t: number, p: Periodo): number {
  const d = new Date(t);
  switch (p) {
    case "dia":
      return t + 864e5;
    case "semana":
      return t + 7 * 864e5;
    case "mes":
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    case "trimestre":
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1);
    case "anio":
      return Date.UTC(d.getUTCFullYear() + 1, 0, 1);
  }
}

export interface Punto {
  t: number;
  etiqueta: string;
  valor: number;
  n: number;
}

/** Serie temporal continua (rellena periodos sin datos con 0 registros). */
export function serieTemporal(
  tabla: Tabla,
  filas: Fila[],
  fecha: string,
  periodo: Periodo,
  medida: string | null,
  c?: Calculo,
): Punto[] {
  const conFecha = filas.filter((f) => f[fecha] instanceof Date);
  if (!conFecha.length) return [];
  const grupos = agrupar(conFecha, (f) => String(inicioPeriodo(f[fecha] as Date, periodo)));
  const tiempos = [...grupos.keys()].map(Number);
  const puntos: Punto[] = [];
  for (let t = Math.min(...tiempos); t <= Math.max(...tiempos); t = siguiente(t, periodo)) {
    const grupo = grupos.get(String(t)) ?? [];
    const valor = grupo.length ? valorDe(tabla, grupo, medida, c) : medida && (c ?? agregacionDe(tabla, medida)) !== "sum" ? NaN : 0;
    puntos.push({ t, etiqueta: etiquetaPeriodo(new Date(t), periodo), valor, n: grupo.length });
  }
  return puntos;
}

export function correlacion(a: number[], b: number[]): number {
  const pares = a.map((x, i) => [x, b[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const n = pares.length;
  if (n < 3) return NaN;
  const ma = pares.reduce((s, [x]) => s + x, 0) / n;
  const mb = pares.reduce((s, [, y]) => s + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (const [x, y] of pares) {
    num += (x - ma) * (y - mb);
    da += (x - ma) ** 2;
    db += (y - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : NaN;
}

export function histograma(valores: number[], cubetas = 24): { desde: number; hasta: number; n: number }[] {
  const v = valores.filter(Number.isFinite);
  if (!v.length) return [];
  const min = Math.min(...v);
  const max = Math.max(...v);
  const paso = (max - min) / cubetas || 1;
  const res = Array.from({ length: cubetas }, (_, i) => ({ desde: min + i * paso, hasta: min + (i + 1) * paso, n: 0 }));
  for (const x of v) res[Math.min(cubetas - 1, Math.floor((x - min) / paso))].n++;
  return res;
}

export function aCSV(filas: Fila[], columnas: string[]): string {
  const celda = (v: Valor) => {
    const t = v === null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return "﻿" + [columnas.join(";"), ...filas.map((f) => columnas.map((c) => celda(f[c])).join(";"))].join("\n");
}
