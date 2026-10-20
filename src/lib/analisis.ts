/**
 * Motor que "entiende" un Excel cualquiera, 100 % en el navegador.
 *
 * 1. Encuentra cada tabla dentro de cada hoja (aunque haya títulos, notas,
 *    filas de total o varias tablas en la misma hoja).
 * 2. Convierte tipos (números, fechas) y asigna un rol a cada columna.
 * 3. Decide cómo agregar cada medida (sumar montos, promediar tasas) y
 *    detecta jerarquías (Región → Sucursal) y columnas de estado.
 */
import * as XLSX from "xlsx";

export type Valor = string | number | Date | null;
export type Fila = Record<string, Valor>;
export type Rol = "fecha" | "id" | "categoria" | "texto" | "medida";
export type Agregacion = "sum" | "mean";
export type Tono = "bueno" | "alerta" | "serio" | "critico" | "neutro";

export interface Columna {
  nombre: string;
  rol: Rol;
  agregacion?: Agregacion;
  /** Medida con pocos valores enteros: sirve también como categoría. */
  discreta?: boolean;
  unicos: number;
  /** Para columnas de estado: tono semántico de cada valor. */
  tonos?: Record<string, Tono>;
}

export interface Jerarquia {
  padre: string;
  hijo: string;
}

export interface Tabla {
  id: string;
  hoja: string;
  titulo: string;
  nombre: string;
  filas: Fila[];
  columnas: Columna[];
  filasTotal: number;
  esDetalle: boolean;
  fechas: string[];
  /** Categorías de menos a más valores, seguidas de medidas discretas. */
  categorias: string[];
  medidas: string[];
  medidaPrincipal: string | null;
  jerarquias: Jerarquia[];
  estado: string | null;
}

const MAX_CATEGORIAS = 60;
const PATRON_PROMEDIO =
  /%|tasa|ratio|promedio|prom\.|porcentaje|índice|indice|edad|plazo|precio|score|nota|rating|temperatura|años|anos|margen|ltv|dti|tipo de cambio|rentabilidad/i;
const PATRON_ID = /(^|\b)(id|código|codigo|rut|folio|nro|número de)\b/i;
const PATRON_TOTAL = /^\s*(total|totales|suma|gran total)\b/i;
const PATRON_ESTADO = /estado|status|situaci[oó]n|etapa/i;
const PRIORIDAD_PRINCIPAL = ["monto", "venta", "importe", "ingreso", "total", "valor", "cantidad", "unidades"];
const TONOS: [RegExp, Tono][] = [
  [/castig|rechaz|default|vencid|perdid|cancelad|fall|incobr/i, "critico"],
  [/mora|atras|riesgo|deud|reclam/i, "serio"],
  [/pendient|revisi|proceso|espera|curso/i, "alerta"],
  [/vigent|activ|al d[ií]a|aprob|complet|pagad|cerrad|ok|ganad|entregad/i, "bueno"],
];

// ---------------------------------------------------------------- lectura

export function leerExcel(datos: ArrayBuffer): Tabla[] {
  const libro = XLSX.read(datos, { type: "array", cellDates: true });
  const tablas: Tabla[] = [];
  for (const hoja of libro.SheetNames) {
    const crudo = XLSX.utils.sheet_to_json<Valor[]>(libro.Sheets[hoja], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
      UTC: true,
    });
    tablas.push(...extraerTablas(crudo, hoja, tablas.length));
  }
  return tablas;
}

const vacio = (v: Valor | undefined) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const esTexto = (v: Valor | undefined): v is string => typeof v === "string" && v.trim() !== "";

/** Rangos [ini, fin) de posiciones consecutivas donde `ok` es verdadero. */
function bloques(ok: boolean[]): [number, number][] {
  const rangos: [number, number][] = [];
  let ini = -1;
  ok.concat(false).forEach((v, i) => {
    if (v && ini < 0) ini = i;
    else if (!v && ini >= 0) {
      rangos.push([ini, i]);
      ini = -1;
    }
  });
  return rangos;
}

function extraerTablas(crudo: Valor[][], hoja: string, desplazamiento: number): Tabla[] {
  const ancho = Math.max(0, ...crudo.map((f) => f.length));
  const grilla = crudo.map((f) => Array.from({ length: ancho }, (_, j) => (vacio(f[j]) ? null : f[j])));
  const tablas: Tabla[] = [];
  let tituloPendiente = "";
  for (const [f0, f1] of bloques(grilla.map((f) => f.some((v) => v !== null)))) {
    const filas = grilla.slice(f0, f1);
    const columnasLlenas = Array.from({ length: ancho }, (_, j) => filas.some((f) => f[j] !== null));
    for (const [c0, c1] of bloques(columnasLlenas)) {
      const bloque = filas.map((f) => f.slice(c0, c1));
      const { tabla, titulo } = bloqueATabla(bloque, hoja, tituloPendiente, desplazamiento + tablas.length);
      if (tabla) {
        tablas.push(tabla);
        tituloPendiente = "";
      } else if (titulo) {
        tituloPendiente = titulo;
      }
    }
  }
  return tablas;
}

function bloqueATabla(bloque: Valor[][], hoja: string, titulo: string, n: number) {
  const ancho = bloque[0]?.length ?? 0;
  const llenos = bloque.map((f) => f.filter((v) => v !== null).length);
  let cabecera = -1;
  for (let i = 0; i < Math.min(bloque.length, 15); i++) {
    const textos = bloque[i].filter(esTexto).length;
    if (ancho >= 2 && llenos[i] >= Math.max(2, ancho * 0.5) && textos === llenos[i]) {
      cabecera = i;
      break;
    }
    if (llenos[i] === 1) {
      const unico = bloque[i].find((v) => v !== null);
      if (esTexto(unico)) titulo = unico.trim();
    }
  }
  if (cabecera < 0 || bloque.length - cabecera - 1 < 2) return { tabla: null, titulo };

  const vistos: Record<string, number> = {};
  const nombres = bloque[cabecera].map((v, j) => {
    const base = v === null ? `Columna ${j + 1}` : String(v).trim();
    vistos[base] = (vistos[base] ?? 0) + 1;
    return vistos[base] === 1 ? base : `${base} (${vistos[base]})`;
  });
  let datos = bloque.slice(cabecera + 1).filter((f) => f.some((v) => v !== null));
  // Notas al pie: filas con una sola celda llena en tablas anchas.
  if (ancho > 2) datos = datos.filter((f) => f.filter((v) => v !== null).length > 1);
  let filasTotal = 0;
  datos = datos.filter((f) => {
    if (typeof f[0] === "string" && PATRON_TOTAL.test(f[0])) {
      filasTotal++;
      return false;
    }
    return !f.filter((v) => v !== null).every((v) => v === 0);
  });
  // Quita columnas completamente vacías.
  const utiles = nombres.map((_, j) => datos.some((f) => f[j] !== null));
  const cols = nombres.filter((_, j) => utiles[j]);
  if (datos.length < 2 || cols.length < 2) return { tabla: null, titulo };

  const filas: Fila[] = datos.map((f) => {
    const fila: Fila = {};
    nombres.forEach((nombre, j) => {
      if (utiles[j]) fila[nombre] = f[j];
    });
    return fila;
  });
  return { tabla: construirTabla(hoja, titulo, filas, cols, filasTotal, n), titulo };
}

// ---------------------------------------------------------------- tipos y roles

function aNumero(v: Valor): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let t = v.trim().replace(/[$%\s]|UF|CLP|USD/gi, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d+$/.test(t)) t = t.replace(",", ".");
  else t = t.replace(/,/g, "");
  if (t === "" || !/^-?\d*\.?\d+(e-?\d+)?$/i.test(t)) return null;
  return Number(t);
}

function aFecha(v: Valor): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v !== "string") return null;
  const t = v.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])); // formato chileno día/mes/año
  return null;
}

const proporcion = (valores: Valor[], prueba: (v: Valor) => unknown) =>
  valores.length ? valores.filter((v) => prueba(v) !== null).length / valores.length : 0;

function construirTabla(hoja: string, titulo: string, filas: Fila[], cols: string[], filasTotal: number, n: number): Tabla {
  const columnas: Columna[] = [];
  const total = filas.length;
  for (const col of cols) {
    const noNulos = filas.map((f) => f[col]).filter((v) => v !== null);
    if (proporcion(noNulos, aNumero) > 0.9) {
      filas.forEach((f) => (f[col] = aNumero(f[col])));
    } else if (proporcion(noNulos, aFecha) > 0.9) {
      filas.forEach((f) => (f[col] = aFecha(f[col])));
    } else {
      filas.forEach((f) => {
        const v = f[col];
        f[col] = v === null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim();
      });
    }
    const valores = filas.map((f) => f[col]).filter((v) => v !== null);
    const unicos = new Set(valores.map((v) => (v instanceof Date ? v.getTime() : v))).size;
    const muestra = valores[0];
    if (muestra instanceof Date) {
      columnas.push({ nombre: col, rol: "fecha", unicos });
    } else if (typeof muestra === "number") {
      const nums = valores as number[];
      const enteros = nums.every((x) => Number.isInteger(x));
      if (PATRON_ID.test(col) && unicos > 0.9 * total) {
        columnas.push({ nombre: col, rol: "id", unicos });
      } else {
        const fraccion = !enteros && nums.every((x) => x >= 0 && x <= 1);
        columnas.push({
          nombre: col,
          rol: "medida",
          agregacion: PATRON_PROMEDIO.test(col) || fraccion ? "mean" : "sum",
          discreta: enteros && unicos <= 12 && total >= 20,
          unicos,
        });
      }
    } else if (unicos > 0.9 * total && total >= 20) {
      columnas.push({ nombre: col, rol: PATRON_ID.test(col) || unicos === total ? "id" : "texto", unicos });
    } else if (unicos <= MAX_CATEGORIAS || unicos <= 0.5 * total) {
      columnas.push({ nombre: col, rol: "categoria", unicos });
    } else {
      columnas.push({ nombre: col, rol: "texto", unicos });
    }
  }

  const fechas = columnas.filter((c) => c.rol === "fecha").map((c) => c.nombre);
  const medidas = columnas.filter((c) => c.rol === "medida").map((c) => c.nombre);
  const cats = columnas.filter((c) => c.rol === "categoria" && c.unicos >= 2).sort((a, b) => a.unicos - b.unicos);
  const discretas = columnas.filter((c) => c.rol === "medida" && c.discreta && c.unicos >= 2);
  const categorias = [...cats, ...discretas].map((c) => c.nombre);
  const agreg = (m: string) => columnas.find((c) => c.nombre === m)?.agregacion;
  const sumables = medidas.filter((m) => agreg(m) === "sum");
  let medidaPrincipal: string | null = null;
  for (const palabra of PRIORIDAD_PRINCIPAL) {
    medidaPrincipal = sumables.find((m) => m.toLowerCase().includes(palabra)) ?? null;
    if (medidaPrincipal) break;
  }
  medidaPrincipal ??= sumables[0] ?? medidas[0] ?? null;

  const primera = categorias[0];
  const esDetalle =
    total >= 30 || (primera !== undefined && new Set(filas.map((f) => f[primera])).size < total);

  // Columna de estado: nombre sugerente + pocos valores, con tono por valor.
  let estado: string | null = null;
  const candidata = cats.find((c) => PATRON_ESTADO.test(c.nombre) && c.unicos <= 10);
  if (candidata) {
    estado = candidata.nombre;
    candidata.tonos = {};
    for (const v of new Set(filas.map((f) => String(f[candidata.nombre] ?? "")))) {
      candidata.tonos[v] = TONOS.find(([re]) => re.test(v))?.[1] ?? "neutro";
    }
  }

  const nombre = !titulo || titulo === hoja ? hoja : `${hoja} › ${titulo}`;
  return {
    id: `t${n}`,
    hoja,
    titulo,
    nombre,
    filas,
    columnas,
    filasTotal,
    esDetalle,
    fechas,
    categorias,
    medidas,
    medidaPrincipal,
    jerarquias: esDetalle ? detectarJerarquias(filas, cats) : [],
    estado,
  };
}

/** Pares padre → hijo donde cada valor del hijo pertenece a un solo padre (p. ej. Región → Sucursal). */
function detectarJerarquias(filas: Fila[], cats: Columna[]): Jerarquia[] {
  const pares: Jerarquia[] = [];
  for (const hijo of cats) {
    for (const padre of cats) {
      if (padre === hijo || padre.unicos < 2 || hijo.unicos <= padre.unicos) continue;
      const mapa = new Map<Valor, Set<Valor>>();
      for (const f of filas) {
        if (f[hijo.nombre] === null) continue;
        if (!mapa.has(f[hijo.nombre])) mapa.set(f[hijo.nombre], new Set());
        mapa.get(f[hijo.nombre])!.add(f[padre.nombre]);
      }
      const unicos = [...mapa.values()].filter((s) => s.size === 1).length;
      if (unicos / mapa.size >= 0.95) pares.push({ padre: padre.nombre, hijo: hijo.nombre });
    }
  }
  // Mantiene solo el padre más cercano de cada hijo (el con más valores).
  const unico = new Map<string, Jerarquia>();
  for (const p of pares) {
    const actual = unico.get(p.hijo);
    const nPadre = (c: string) => cats.find((x) => x.nombre === c)!.unicos;
    if (!actual || nPadre(p.padre) > nPadre(actual.padre)) unico.set(p.hijo, p);
  }
  return [...unico.values()];
}

export function columna(tabla: Tabla, nombre: string): Columna {
  return tabla.columnas.find((c) => c.nombre === nombre)!;
}

export function agregacionDe(tabla: Tabla, medida: string): Agregacion {
  return columna(tabla, medida).agregacion ?? "sum";
}

export function descripcion(c: Columna): string {
  if (c.rol === "medida") {
    const base = c.agregacion === "mean" ? "Medida · se promedia" : "Medida · se suma";
    return c.discreta ? `${base} · también agrupa` : base;
  }
  return { fecha: "Fecha", id: "Identificador", categoria: c.tonos ? "Estado" : "Categoría", texto: "Texto libre" }[c.rol];
}
