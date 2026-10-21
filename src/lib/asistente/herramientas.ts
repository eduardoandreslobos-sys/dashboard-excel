/**
 * Herramientas del asistente: definiciones (formato OpenAI) y ejecutores puros.
 * Se ejecutan en el navegador sobre la tabla ya cargada, con los mismos cálculos que los gráficos.
 */
import { agregacionDe, type Fila, type Tabla } from "@/lib/analisis";
import { correlacion, mesLargo, porCategoria, serieTemporal, texto, valorDe, type Barra, type Calculo, type Periodo, type Punto } from "@/lib/calculo";
import { aplicarFiltros, type Filtros } from "@/lib/hallazgos";

/** Gráfico o tabla que el asistente crea a pedido; se dibuja bajo la respuesta. */
export type Visualizacion = { titulo: string; filtros: Record<string, string[]> } & (
  | { tipo: "barras"; nombre: string; barras: Barra[]; sumable: boolean }
  | { tipo: "lineas"; nombre: string; puntos: Punto[]; sumable: boolean }
  | { tipo: "dispersion"; x: string; y: string; puntos: [number, number][] }
  | { tipo: "tabla"; columnas: string[]; filas: (string | number | null)[][] }
);

export interface Acciones {
  setFiltro: (columna: string, valores: string[]) => void;
  limpiarFiltros: () => void;
  setVista: (vista: string) => void;
  setMedida: (medida: string | null) => void;
}

export interface Contexto {
  tabla: Tabla;
  /** Filas con los filtros del dashboard aplicados. */
  filas: Fila[];
  filtros: Filtros;
  vistas: string[];
  acciones: Acciones;
}

const VISTAS_TEXTO: Record<string, string> = {
  resumen: "Resumen", tendencias: "Tendencias", segmentos: "Segmentos", riesgo: "Distribución",
  relaciones: "Relaciones", explorar: "Explorador", datos: "Datos", lectura: "Cómo lo entendí",
};

const CALCULOS: Record<string, Calculo> = { suma: "sum", promedio: "mean", conteo: "count", maximo: "max", minimo: "min", mediana: "median" };
const filtrosParam = {
  type: "object",
  description: "Solo si el usuario pide limitar a ciertos valores (ej.: «solo la RM»): { columna: [valores exactos] }. Si no lo pide, omítelo. No cambia el dashboard.",
  additionalProperties: { type: "array", items: { type: "string" } },
};

const medidaGrafico = { type: "string", description: "Columna numérica, o \"registros\" para contar. Por defecto, la medida principal." };
const tituloParam = { type: "string", description: "Título corto en español." };
const GRAFICOS: Record<string, Visualizacion["tipo"]> = { grafico_barras: "barras", grafico_lineas: "lineas", grafico_dispersion: "dispersion", tabla_datos: "tabla" };

export const DEFINICIONES = [
  {
    type: "function",
    function: {
      name: "resumen_tabla",
      description: "Resumen general: cantidad de registros, totales y promedios de cada medida, cuántos registros hay por cada valor de las categorías chicas (estado, segmento…), rango de fechas y filtros activos.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "agregar_por_categoria",
      description: "Calcula una medida agrupada por una columna categórica (ranking por región, segmento, estado, etc.). Sin medida, cuenta registros y da el porcentaje de cada grupo. No dibuja nada: para un gráfico usa grafico_barras.",
      parameters: {
        type: "object",
        properties: {
          columna: { type: "string", description: "Columna categórica por la que agrupar." },
          medida: { type: "string", description: "Columna numérica. Omitir para contar registros." },
          calculo: { type: "string", enum: Object.keys(CALCULOS), description: "Por defecto: suma para montos, promedio para tasas." },
          orden: { type: "string", enum: ["desc", "asc"] },
          limite: { type: "integer", minimum: 1, maximum: 30 },
          filtros: filtrosParam,
        },
        required: ["columna"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "serie_temporal",
      description: "Datos de la evolución de una medida en el tiempo (por día, semana, mes, trimestre o año). No dibuja nada: para un gráfico usa grafico_lineas.",
      parameters: {
        type: "object",
        properties: {
          medida: { type: "string", description: "Columna numérica. Omitir para contar registros." },
          periodo: { type: "string", enum: ["dia", "semana", "mes", "trimestre", "anio"] },
          calculo: { type: "string", enum: Object.keys(CALCULOS) },
          filtros: filtrosParam,
        },
        required: ["periodo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ranking_registros",
      description: "Lista los registros individuales con mayor o menor valor de una medida.",
      parameters: {
        type: "object",
        properties: {
          ordenar_por: { type: "string", description: "Columna numérica." },
          orden: { type: "string", enum: ["desc", "asc"] },
          limite: { type: "integer", minimum: 1, maximum: 15 },
          filtros: filtrosParam,
        },
        required: ["ordenar_por"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "correlacion",
      description: "Correlación (Pearson, de -1 a 1) entre dos medidas numéricas.",
      parameters: {
        type: "object",
        properties: { medida_a: { type: "string" }, medida_b: { type: "string" }, filtros: filtrosParam },
        required: ["medida_a", "medida_b"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grafico_barras",
      description: "Dibuja bajo tu respuesta un gráfico de barras de una medida por categoría (no cambia el dashboard). Úsalo cuando pidan un gráfico, comparar o visualizar por región, segmento, estado, etc.",
      parameters: {
        type: "object",
        properties: {
          columna: { type: "string", description: "Columna categórica (eje de las barras)." },
          medida: medidaGrafico,
          calculo: { type: "string", enum: Object.keys(CALCULOS) },
          orden: { type: "string", enum: ["desc", "asc"] },
          limite: { type: "integer", minimum: 1, maximum: 30 },
          titulo: tituloParam,
          filtros: filtrosParam,
        },
        required: ["columna"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grafico_lineas",
      description: "Dibuja bajo tu respuesta un gráfico de la evolución de una medida en el tiempo (no cambia el dashboard). Úsalo cuando pidan graficar una tendencia o evolución.",
      parameters: {
        type: "object",
        properties: {
          medida: medidaGrafico,
          periodo: { type: "string", enum: ["dia", "semana", "mes", "trimestre", "anio"] },
          calculo: { type: "string", enum: Object.keys(CALCULOS) },
          titulo: tituloParam,
          filtros: filtrosParam,
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grafico_dispersion",
      description: "Dibuja bajo tu respuesta un gráfico de dispersión entre dos medidas numéricas, con su correlación. Úsalo cuando pregunten si hay relación entre dos medidas y quieran verlo.",
      parameters: {
        type: "object",
        properties: { medida_x: { type: "string" }, medida_y: { type: "string" }, titulo: tituloParam, filtros: filtrosParam },
        required: ["medida_x", "medida_y"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "tabla_datos",
      description:
        "Muestra una tabla bajo tu respuesta. Con columna: una fila por categoría y una columna por cada medida. Sin columna: los registros con mayor valor de la primera medida (ej.: los 5 créditos más grandes).",
      parameters: {
        type: "object",
        properties: {
          columna: { type: "string", description: "Columna categórica para agrupar. Omitir para listar registros." },
          medidas: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6, description: "Columnas numéricas." },
          orden: { type: "string", enum: ["desc", "asc"] },
          limite: { type: "integer", minimum: 1, maximum: 30 },
          titulo: tituloParam,
          filtros: filtrosParam,
        },
        required: ["medidas"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "aplicar_filtro",
      description: "Filtra el dashboard que el usuario está viendo (todos los gráficos). Úsalo cuando pida 'muéstrame', 'filtra', 'solo'.",
      parameters: {
        type: "object",
        properties: { columna: { type: "string" }, valores: { type: "array", items: { type: "string" }, minItems: 1 } },
        required: ["columna", "valores"],
      },
    },
  },
  {
    type: "function",
    function: { name: "limpiar_filtros", description: "Quita todos los filtros del dashboard.", parameters: { type: "object", properties: {} } },
  },
  {
    type: "function",
    function: {
      name: "cambiar_vista",
      description: "Cambia la pestaña visible del dashboard.",
      parameters: { type: "object", properties: { vista: { type: "string", enum: Object.keys(VISTAS_TEXTO) } }, required: ["vista"] },
    },
  },
  {
    type: "function",
    function: {
      name: "cambiar_medida",
      description: "Cambia la medida principal que muestran los gráficos.",
      parameters: { type: "object", properties: { medida: { type: "string" } }, required: ["medida"] },
    },
  },
] as const;

export const NOMBRES = DEFINICIONES.map((d) => d.function.name);
export const DEFINICIONES_GRAFICOS = DEFINICIONES.filter((d) => d.function.name in GRAFICOS);
/** El usuario pide explícitamente un gráfico o una tabla. */
export const PIDE_VISUAL = /gr[aá]fic|tabla|visualiz|dibuj|plot|chart/i;

type Args = Record<string, unknown>;
const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/** Busca una columna aunque el modelo la escriba con otras mayúsculas o sin tildes. */
function resolverColumna(tabla: Tabla, nombre: unknown, roles?: string[]): string {
  if (typeof nombre !== "string" || !nombre.trim()) throw new Error("Falta indicar la columna.");
  const encontrada = tabla.columnas.find((c) => sinTildes(c.nombre) === sinTildes(nombre));
  if (!encontrada) throw new Error(`La columna «${nombre}» no existe. Columnas disponibles: ${tabla.columnas.map((c) => c.nombre).join(", ")}.`);
  if (roles && !roles.includes(encontrada.rol) && !(roles.includes("categoria") && encontrada.discreta)) {
    throw new Error(`«${encontrada.nombre}» no sirve para esto (es de tipo ${encontrada.rol}).`);
  }
  return encontrada.nombre;
}

/** Ajusta los valores pedidos a los valores exactos de la columna. */
function resolverValores(tabla: Tabla, col: string, valores: unknown): string[] {
  if (!Array.isArray(valores) || !valores.length) throw new Error("Indica al menos un valor.");
  const existentes = [...new Set(tabla.filas.map((f) => texto(f[col])))];
  return valores.map((v) => {
    const exacto = existentes.find((e) => sinTildes(e) === sinTildes(String(v)));
    if (!exacto) throw new Error(`«${v}» no es un valor de ${col}. Algunos valores: ${existentes.slice(0, 15).join(", ")}.`);
    return exacto;
  });
}

function filasCon(ctx: Contexto, filtros: unknown): Fila[] {
  if (!filtros || typeof filtros !== "object") return ctx.filas;
  const categorias: Record<string, string[]> = {};
  for (const [col, vals] of Object.entries(filtros as Record<string, unknown>)) {
    const c = resolverColumna(ctx.tabla, col);
    categorias[c] = resolverValores(ctx.tabla, c, vals);
  }
  return aplicarFiltros(ctx.filas, { categorias, fechas: {} });
}

function calculoDe(tabla: Tabla, medida: string | null, pedido: unknown): Calculo {
  if (typeof pedido === "string" && CALCULOS[pedido]) return CALCULOS[pedido];
  return medida ? agregacionDe(tabla, medida) : "count";
}

const nombreCalculo = (c: Calculo) => Object.entries(CALCULOS).find(([, v]) => v === c)?.[0] ?? c;
const redondear = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);

function filtrosActivos(f: Filtros) {
  return Object.fromEntries(Object.entries(f.categorias).filter(([, v]) => v.length));
}

/** Texto corto que se muestra en el panel "pensamiento" mientras corre la herramienta. */
export function describirPaso(nombre: string, args: Args): string {
  const m = typeof args.medida === "string" ? args.medida : "registros";
  switch (nombre) {
    case "resumen_tabla": return "Leyendo el resumen de la tabla…";
    case "agregar_por_categoria": return `Calculando ${m} por ${String(args.columna ?? "categoría")}…`;
    case "serie_temporal": return `Revisando la evolución de ${m}…`;
    case "ranking_registros": return `Buscando los registros con más ${String(args.ordenar_por ?? "")}…`;
    case "correlacion": return `Comparando ${String(args.medida_a)} con ${String(args.medida_b)}…`;
    case "grafico_barras": case "grafico_lineas": case "grafico_dispersion": case "tabla_datos":
      return `Creando ${nombre === "tabla_datos" ? "la tabla" : "el gráfico"}${typeof args.titulo === "string" ? ` «${args.titulo}»` : ""}…`;
    case "aplicar_filtro": return `Filtrando el dashboard por ${String(args.columna)}…`;
    case "limpiar_filtros": return "Quitando los filtros…";
    case "cambiar_vista": return `Abriendo ${VISTAS_TEXTO[String(args.vista)] ?? "otra vista"}…`;
    case "cambiar_medida": return `Cambiando la medida a ${String(args.medida)}…`;
    default: return "Consultando los datos…";
  }
}

/** Ejecuta una herramienta. Devuelve datos compactos para el modelo o un error explicativo. */
export function ejecutar(nombre: string, args: Args, ctx: Contexto): unknown {
  const { tabla } = ctx;
  try {
    switch (nombre) {
      case "resumen_tabla": {
        const fechas = tabla.fechas[0] ? ctx.filas.map((f) => f[tabla.fechas[0]]).filter((v): v is Date => v instanceof Date) : [];
        return {
          tabla: tabla.nombre,
          registros_visibles: ctx.filas.length,
          registros_totales: tabla.filas.length,
          filtros_del_dashboard: filtrosActivos(ctx.filtros),
          medidas: tabla.medidas.map((m) => ({ medida: m, calculo: nombreCalculo(agregacionDe(tabla, m)), valor: redondear(valorDe(tabla, ctx.filas, m)) })),
          cantidad_de_registros_por_valor: Object.fromEntries(
            tabla.categorias
              .map((c) => [c, porCategoria(tabla, ctx.filas, c, null, "count")] as const)
              .filter(([, barras]) => barras.length > 1 && barras.length <= 8)
              .map(([c, barras]) => [c, Object.fromEntries(barras.map((b) => [b.etiqueta, `${b.n} registros, ${redondear((b.n / Math.max(1, ctx.filas.length)) * 100)} % del total`]))]),
          ),
          rango_fechas: fechas.length ? { desde: mesLargo(new Date(Math.min(...fechas.map(Number)))), hasta: mesLargo(new Date(Math.max(...fechas.map(Number)))) } : null,
        };
      }
      case "agregar_por_categoria": {
        const col = resolverColumna(tabla, args.columna, ["categoria", "fecha"]);
        const medida = args.medida ? resolverColumna(tabla, args.medida, ["medida"]) : null;
        const c = calculoDe(tabla, medida, args.calculo);
        const filas = filasCon(ctx, args.filtros);
        let barras = porCategoria(tabla, filas, col, medida, c);
        if (args.orden === "asc") barras = [...barras].reverse();
        // El porcentaje es sobre todos los grupos, aunque se haya filtrado por la misma columna.
        const sinFiltroPropio = args.filtros && typeof args.filtros === "object"
          ? Object.fromEntries(Object.entries(args.filtros as Record<string, unknown>).filter(([k]) => sinTildes(k) !== sinTildes(col)))
          : undefined;
        const base = porCategoria(tabla, filasCon(ctx, sinFiltroPropio), col, medida, c);
        const total = c === "sum" || c === "count" ? base.reduce((s, b) => s + (Number.isFinite(b.valor) ? b.valor : 0), 0) : null;
        const limite = Math.min(Number(args.limite) || 10, 30);
        return {
          agrupado_por: col, medida: medida ?? "registros", calculo: nombreCalculo(c), grupos_totales: barras.length,
          filtros_del_dashboard: filtrosActivos(ctx.filtros),
          resultado: barras.slice(0, limite).map((b) => ({
            [col]: b.etiqueta, valor: redondear(b.valor), registros: b.n,
            ...(total ? { porcentaje_del_total: redondear((b.valor / total) * 100) } : {}),
          })),
          ...(total !== null ? { total: redondear(total) } : {}),
        };
      }
      case "serie_temporal": {
        const fecha = tabla.fechas[0];
        if (!fecha) throw new Error("Esta tabla no tiene una columna de fecha.");
        const medida = args.medida ? resolverColumna(tabla, args.medida, ["medida"]) : null;
        const c = calculoDe(tabla, medida, args.calculo);
        const periodo = (["dia", "semana", "mes", "trimestre", "anio"].includes(String(args.periodo)) ? args.periodo : "mes") as Periodo;
        const puntos = serieTemporal(tabla, filasCon(ctx, args.filtros), fecha, periodo, medida, c);
        return {
          medida: medida ?? "registros", calculo: nombreCalculo(c), periodo,
          puntos: puntos.slice(-60).map((p) => ({ periodo: p.etiqueta, valor: redondear(p.valor), registros: p.n })),
          ...(puntos.length > 60 ? { nota: `Se muestran los últimos 60 de ${puntos.length} periodos.` } : {}),
        };
      }
      case "ranking_registros": {
        const medida = resolverColumna(tabla, args.ordenar_por, ["medida"]);
        const limite = Math.min(Number(args.limite) || 5, 15);
        const filas = [...filasCon(ctx, args.filtros)]
          .filter((f) => typeof f[medida] === "number")
          .sort((a, b) => ((b[medida] as number) - (a[medida] as number)) * (args.orden === "asc" ? -1 : 1))
          .slice(0, limite);
        const cols = tabla.columnas.filter((c) => c.rol !== "texto").slice(0, 10).map((c) => c.nombre);
        return { ordenado_por: medida, registros: filas.map((f) => Object.fromEntries(cols.map((c) => [c, texto(f[c])]))) };
      }
      case "correlacion": {
        const a = resolverColumna(tabla, args.medida_a, ["medida"]);
        const b = resolverColumna(tabla, args.medida_b, ["medida"]);
        const filas = filasCon(ctx, args.filtros);
        const r = correlacion(filas.map((f) => f[a] as number), filas.map((f) => f[b] as number));
        const fuerza = Math.abs(r) >= 0.7 ? "fuerte" : Math.abs(r) >= 0.4 ? "moderada" : "débil o nula";
        return { medida_a: a, medida_b: b, r: redondear(r), interpretacion: `relación ${fuerza}${r > 0 ? ", suben juntas" : r < 0 ? ", una sube cuando la otra baja" : ""}` };
      }
      case "grafico_barras": case "grafico_lineas": case "grafico_dispersion": case "tabla_datos": {
        const visualizacion = crearVisualizacion({ ...args, tipo: GRAFICOS[nombre] }, ctx);
        return { hecho: true, ...resumirVisualizacion(visualizacion), mensaje: "Ya se muestra bajo tu respuesta. Comenta el hallazgo principal; no lo describas punto por punto.", visualizacion };
      }
      case "aplicar_filtro": {
        const col = resolverColumna(tabla, args.columna, ["categoria"]);
        const valores = resolverValores(tabla, col, args.valores);
        ctx.acciones.setFiltro(col, valores);
        return { hecho: true, filtro: { [col]: valores }, mensaje: "El dashboard ya muestra solo esos registros." };
      }
      case "limpiar_filtros":
        ctx.acciones.limpiarFiltros();
        return { hecho: true };
      case "cambiar_vista": {
        const vista = String(args.vista);
        if (!ctx.vistas.includes(vista)) throw new Error(`Esa vista no está disponible para esta tabla. Vistas: ${ctx.vistas.join(", ")}.`);
        ctx.acciones.setVista(vista);
        return { hecho: true, vista: VISTAS_TEXTO[vista] };
      }
      case "cambiar_medida": {
        const medida = resolverColumna(tabla, args.medida, ["medida"]);
        ctx.acciones.setMedida(medida);
        return { hecho: true, medida };
      }
      default:
        throw new Error(`No conozco la herramienta «${nombre}».`);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo calcular." };
  }
}

/** Corrige argumentos que el modelo pone en el parámetro equivocado (p. ej. la categoría en medida_x). */
function normalizar(args: Args, tabla: Tabla): Args {
  const a = { ...args };
  const rol = (v: unknown) => (typeof v === "string" ? tabla.columnas.find((c) => sinTildes(c.nombre) === sinTildes(v)) : undefined);
  const esCategoria = (v: unknown) => { const c = rol(v); return Boolean(c && (c.rol === "categoria" || c.discreta)); };
  const esMedida = (v: unknown) => rol(v)?.rol === "medida";
  if (a.tipo !== "dispersion") {
    if (!a.columna) a.columna = [a.medida_x, a.medida_y, a.medida].find(esCategoria);
    if (!a.medida) a.medida = [a.medida_y, a.medida_x].find(esMedida);
    if (a.tipo === "tabla" && !(Array.isArray(a.medidas) && a.medidas.length)) a.medidas = [a.medida, a.medida_y, a.medida_x].filter(esMedida);
    // Agrupar por un identificador no tiene sentido: es una lista de registros.
    if (a.tipo === "tabla" && a.columna && !esCategoria(a.columna)) delete a.columna;
  } else {
    const medidas = [a.medida_x, a.medida_y, a.medida, ...(Array.isArray(a.medidas) ? a.medidas : [])].filter(esMedida);
    [a.medida_x, a.medida_y] = [...new Set(medidas)];
  }
  // Filtros sin valores reales (["*"], "todos") se ignoran.
  if (a.filtros && typeof a.filtros === "object") {
    a.filtros = Object.fromEntries(
      Object.entries(a.filtros as Record<string, unknown>).filter(([, v]) => Array.isArray(v) && v.length && !v.some((x) => /^(\*|todos?|todas?|all)$/i.test(String(x)))),
    );
  }
  return a;
}

function crearVisualizacion(entrada: Args, ctx: Contexto): Visualizacion {
  const { tabla } = ctx;
  const args = normalizar(entrada, tabla);
  const filas = filasCon(ctx, args.filtros);
  const filtros = { ...filtrosActivos(ctx.filtros), ...(args.filtros && typeof args.filtros === "object" ? (args.filtros as Record<string, string[]>) : {}) };
  const limite = Math.min(Number(args.limite) || 12, 30);
  const titulo = (t: string) => (typeof args.titulo === "string" && args.titulo.trim() ? args.titulo.trim().slice(0, 80) : t);
  // Sin medida se usa la principal; "registros" (o similar) cuenta filas.
  const medidaDe = (v: unknown) => {
    if (typeof v === "string" && /^(registros?|conteo|cantidad|n)$/i.test(v.trim())) return null;
    return v ? resolverColumna(tabla, v, ["medida"]) : tabla.medidaPrincipal;
  };

  switch (args.tipo) {
    case "barras": {
      const col = resolverColumna(tabla, args.columna, ["categoria", "fecha"]);
      const medida = medidaDe(args.medida);
      const c = calculoDe(tabla, medida, args.calculo);
      let barras = porCategoria(tabla, filas, col, medida, c);
      if (args.orden === "asc") barras = [...barras].reverse();
      const nombre = medida ?? "Registros";
      return { tipo: "barras", titulo: titulo(`${nombre} por ${col}`), filtros, nombre, barras: barras.slice(0, limite), sumable: c === "sum" || c === "count" };
    }
    case "lineas": {
      const fecha = tabla.fechas[0];
      if (!fecha) throw new Error("Esta tabla no tiene una columna de fecha para un gráfico de líneas.");
      const medida = medidaDe(args.medida);
      const c = calculoDe(tabla, medida, args.calculo);
      const periodo = (["dia", "semana", "mes", "trimestre", "anio"].includes(String(args.periodo)) ? args.periodo : "mes") as Periodo;
      const nombre = medida ?? "Registros";
      return { tipo: "lineas", titulo: titulo(`${nombre} en el tiempo`), filtros, nombre, puntos: serieTemporal(tabla, filas, fecha, periodo, medida, c).slice(-120), sumable: c === "sum" || c === "count" };
    }
    case "dispersion": {
      const x = resolverColumna(tabla, args.medida_x, ["medida"]);
      const y = resolverColumna(tabla, args.medida_y, ["medida"]);
      const puntos = filas.map((f) => [f[x], f[y]] as [number, number]).filter(([a, b]) => typeof a === "number" && typeof b === "number");
      return { tipo: "dispersion", titulo: titulo(`${y} versus ${x}`), filtros, x, y, puntos: puntos.slice(0, 3000) };
    }
    case "tabla": {
      const pedidas = Array.isArray(args.medidas) && args.medidas.length ? args.medidas : args.medida ? [args.medida] : [];
      const medidas = [...new Set(pedidas.slice(0, 6).map((m) => resolverColumna(tabla, m, ["medida"])))];
      if (args.columna) {
        const col = resolverColumna(tabla, args.columna, ["categoria", "fecha"]);
        const conteo = porCategoria(tabla, filas, col, null, "count");
        const valores = medidas.map((m) => new Map(porCategoria(tabla, filas, col, m, calculoDe(tabla, m, args.calculo)).map((b) => [b.etiqueta, b.valor])));
        let orden = conteo;
        if (medidas.length) orden = [...conteo].sort((a, b) => (valores[0].get(b.etiqueta) ?? 0) - (valores[0].get(a.etiqueta) ?? 0));
        if (args.orden === "asc") orden = [...orden].reverse();
        return {
          tipo: "tabla", titulo: titulo(`${medidas[0] ?? "Registros"} por ${col}`), filtros,
          columnas: [col, "Registros", ...medidas],
          filas: orden.slice(0, limite).map((b) => [b.etiqueta, b.n, ...valores.map((v) => redondear(v.get(b.etiqueta) ?? NaN))]),
        };
      }
      const orden = medidas[0];
      if (!orden) throw new Error("Para una tabla de registros indica en 'medidas' la columna por la que ordenar.");
      const cols = [...new Set([...tabla.columnas.filter((c) => c.rol === "id" || c.rol === "categoria").slice(0, 3).map((c) => c.nombre), ...medidas])];
      const top = [...filas]
        .filter((f) => typeof f[orden] === "number")
        .sort((a, b) => ((b[orden] as number) - (a[orden] as number)) * (args.orden === "asc" ? -1 : 1))
        .slice(0, limite);
      return {
        tipo: "tabla", titulo: titulo(`Registros con ${args.orden === "asc" ? "menor" : "mayor"} ${orden}`), filtros,
        columnas: cols,
        filas: top.map((f) => cols.map((c) => (typeof f[c] === "number" ? redondear(f[c] as number) : texto(f[c])))),
      };
    }
    default:
      throw new Error("Tipo de visualización no válido: usa barras, lineas, dispersion o tabla.");
  }
}

/** Lo que el modelo necesita saber del gráfico para comentarlo (sin todos los puntos). */
function resumirVisualizacion(v: Visualizacion) {
  const base = { tipo: v.tipo, titulo: v.titulo };
  switch (v.tipo) {
    case "barras": {
      const total = v.sumable ? v.barras.reduce((s, b) => s + (Number.isFinite(b.valor) ? b.valor : 0), 0) : 0;
      return { ...base, datos: v.barras.slice(0, 10).map((b) => ({ grupo: b.etiqueta, valor: redondear(b.valor), registros: b.n, ...(total ? { porcentaje: redondear((b.valor / total) * 100) } : {}) })) };
    }
    case "lineas": {
      const validos = v.puntos.filter((p) => Number.isFinite(p.valor));
      if (!validos.length) return { ...base, datos: [] };
      const max = validos.reduce((a, b) => (b.valor > a.valor ? b : a));
      const min = validos.reduce((a, b) => (b.valor < a.valor ? b : a));
      return { ...base, periodos: validos.length, primero: { periodo: validos[0].etiqueta, valor: redondear(validos[0].valor) }, ultimo: { periodo: validos.at(-1)!.etiqueta, valor: redondear(validos.at(-1)!.valor) }, maximo: { periodo: max.etiqueta, valor: redondear(max.valor) }, minimo: { periodo: min.etiqueta, valor: redondear(min.valor) } };
    }
    case "dispersion": {
      const r = correlacion(v.puntos.map((p) => p[0]), v.puntos.map((p) => p[1]));
      return { ...base, puntos: v.puntos.length, correlacion: redondear(r) };
    }
    case "tabla":
      return { ...base, columnas: v.columnas, primeras_filas: v.filas.slice(0, 8), filas: v.filas.length };
  }
}

/** Separa el gráfico (para dibujarlo) de lo que se le devuelve al modelo. */
export function separarVisualizacion(resultado: unknown): { paraModelo: unknown; visualizacion: Visualizacion | null } {
  if (resultado && typeof resultado === "object" && "visualizacion" in resultado) {
    const { visualizacion, ...resto } = resultado as { visualizacion: Visualizacion };
    return { paraModelo: resto, visualizacion };
  }
  return { paraModelo: resultado, visualizacion: null };
}

/** Columnas, valores y estado que el modelo necesita para elegir bien las herramientas. */
export function describirTabla(ctx: Contexto, vistaActual: string, medidaActual: string | null): string {
  const { tabla } = ctx;
  const columnas = tabla.columnas.map((c) => {
    if (c.rol === "medida") return `- ${c.nombre}: medida numérica (${c.agregacion === "mean" ? "se promedia" : "se suma"})`;
    if (c.rol === "categoria") {
      const valores = [...new Set(tabla.filas.map((f) => texto(f[c.nombre])))];
      return `- ${c.nombre}: categoría con ${valores.length} valores${valores.length <= 25 ? `: ${valores.join(", ")}` : ` (ej.: ${valores.slice(0, 10).join(", ")}…)`}`;
    }
    return `- ${c.nombre}: ${c.rol}`;
  });
  return [
    `Tabla: «${tabla.nombre}», ${tabla.filas.length} registros (${ctx.filas.length} visibles con los filtros actuales).`,
    "Columnas:",
    ...columnas,
    tabla.medidaPrincipal ? `Medida principal: ${tabla.medidaPrincipal}.` : "",
    `Vista abierta: ${VISTAS_TEXTO[vistaActual] ?? vistaActual}. Medida en los gráficos: ${medidaActual ?? "—"}.`,
    `Filtros activos del dashboard: ${JSON.stringify(filtrosActivos(ctx.filtros))}.`,
    `Vistas disponibles: ${ctx.vistas.join(", ")}.`,
  ].filter(Boolean).join("\n");
}
