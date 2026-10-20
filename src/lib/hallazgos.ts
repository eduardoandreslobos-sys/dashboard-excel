import { agregacionDe, type Fila, type Tabla } from "./analisis";
import { correlacion, formato, mesLargo, porCategoria, serieTemporal, texto } from "./calculo";

export interface Filtros {
  /** Valores elegidos por categoría (vacío = todos). */
  categorias: Record<string, string[]>;
  /** Rango de fechas [desde, hasta] en ms UTC. */
  fechas: Record<string, [number, number]>;
}

export const SIN_FILTROS: Filtros = { categorias: {}, fechas: {} };

export function aplicarFiltros(filas: Fila[], filtros: Filtros, excepto?: string): Fila[] {
  const cats = Object.entries(filtros.categorias).filter(([c, v]) => c !== excepto && v.length);
  const rangos = Object.entries(filtros.fechas);
  if (!cats.length && !rangos.length) return filas;
  const conjuntos = cats.map(([c, v]) => [c, new Set(v)] as const);
  return filas.filter(
    (f) =>
      conjuntos.every(([c, s]) => s.has(texto(f[c]))) &&
      rangos.every(([c, [a, b]]) => {
        const d = f[c];
        return !(d instanceof Date) || (d.getTime() >= a && d.getTime() <= b);
      }),
  );
}

export function cantidadFiltros(f: Filtros): number {
  return Object.values(f.categorias).filter((v) => v.length).length + Object.keys(f.fechas).length;
}

export interface Hallazgo {
  tipo: "concentracion" | "extremo" | "tendencia" | "relacion" | "riesgo";
  texto: string;
  /** Filtro que permite "ver los datos" detrás del hallazgo. */
  accion?: { columna: string; valor: string };
}

/** Frases cortas con lo más destacado, calculadas con reglas simples y trazables. */
export function hallazgos(tabla: Tabla, filas: Fila[], medida: string | null): Hallazgo[] {
  const notas: Hallazgo[] = [];
  if (filas.length < 5) return notas;
  const agreg = medida ? agregacionDe(tabla, medida) : null;

  if (tabla.estado) {
    const tonos = tabla.columnas.find((c) => c.nombre === tabla.estado)?.tonos ?? {};
    const riesgo = Object.entries(tonos).filter(([, t]) => t === "critico" || t === "serio").map(([v]) => v);
    const n0 = filas.filter((f) => riesgo.includes(texto(f[tabla.estado!]))).length;
    if (riesgo.length && n0 > 0) {
      const n = filas.filter((f) => riesgo.includes(texto(f[tabla.estado!]))).length;
      const peor = porCategoria(tabla, filas.filter((f) => riesgo.includes(texto(f[tabla.estado!]))), tabla.estado, null)[0];
      notas.push({
        tipo: "riesgo",
        texto: `**${formato((n / filas.length) * 100)} %** de los registros está en ${riesgo.join(" o ").toLowerCase()} (${formato(n)} de ${formato(filas.length)}).`,
        accion: peor ? { columna: tabla.estado, valor: peor.etiqueta } : undefined,
      });
    }
  }

  if (medida && agreg === "sum") {
    for (const cat of tabla.categorias.filter((c) => c !== tabla.estado).slice(0, 6)) {
      const barras = porCategoria(tabla, filas, cat, medida);
      if (barras.length < 3 || barras.length > 30) continue;
      const totalM = barras.reduce((s, b) => s + b.valor, 0);
      const pct = (barras[0].valor / totalM) * 100;
      if (pct >= 100 / barras.length * 1.6) {
        notas.push({
          tipo: "concentracion",
          texto: `**${barras[0].etiqueta}** concentra el **${formato(pct)} %** de ${medida} (entre ${barras.length} valores de ${cat}).`,
          accion: { columna: cat, valor: barras[0].etiqueta },
        });
        break;
      }
    }
  }

  for (const m of tabla.medidas.filter((x) => agregacionDe(tabla, x) === "mean").slice(0, 2)) {
    const cat = tabla.categorias.find((c) => c !== m && new Set(filas.map((f) => f[c])).size <= 12 && new Set(filas.map((f) => f[c])).size >= 2);
    if (!cat) continue;
    const barras = porCategoria(tabla, filas, cat, m);
    const alto = barras[0];
    const bajo = barras[barras.length - 1];
    notas.push({
      tipo: "extremo",
      texto: `${m}: más alto en **${alto.etiqueta}** (${formato(alto.valor)}) y más bajo en **${bajo.etiqueta}** (${formato(bajo.valor)}), según ${cat}.`,
      accion: { columna: cat, valor: alto.etiqueta },
    });
  }

  if (tabla.fechas.length && medida) {
    const serie = serieTemporal(tabla, filas, tabla.fechas[0], "mes", medida).filter((p) => Number.isFinite(p.valor));
    if (serie.length >= 3) {
      const max = serie.reduce((a, b) => (b.valor > a.valor ? b : a));
      const min = serie.reduce((a, b) => (b.valor < a.valor ? b : a));
      const [penult, ult] = serie.slice(-2);
      const cambio = penult.valor ? ((ult.valor / penult.valor) - 1) * 100 : 0;
      notas.push({
        tipo: "tendencia",
        texto: `Mejor mes en ${agreg === "mean" ? "promedio de" : "total de"} ${medida}: **${mesLargo(new Date(max.t))}** (${formato(max.valor)}); el más bajo, **${mesLargo(new Date(min.t))}** (${formato(min.valor)}). El último mes ${cambio >= 0 ? "subió" : "bajó"} **${formato(Math.abs(cambio))} %**.`,
      });
    }
  }

  const medidas = tabla.medidas.filter((m) => new Set(filas.map((f) => f[m])).size > 1);
  let mejor: [number, string, string] | null = null;
  for (let i = 0; i < medidas.length; i++)
    for (let j = i + 1; j < medidas.length; j++) {
      const r = correlacion(filas.map((f) => f[medidas[i]] as number), filas.map((f) => f[medidas[j]] as number));
      if (Math.abs(r) < 0.995 && (!mejor || Math.abs(r) > Math.abs(mejor[0]))) mejor = [r, medidas[i], medidas[j]];
    }
  if (mejor && Math.abs(mejor[0]) >= 0.5) {
    notas.push({
      tipo: "relacion",
      texto: `**${mejor[1]}** y **${mejor[2]}** ${mejor[0] > 0 ? "suben juntas" : "se mueven en sentido contrario"} (correlación ${formato(mejor[0])}).`,
    });
  }
  return notas;
}
