/**
 * Herramientas del asistente: definiciones (formato OpenAI) y ejecutores puros.
 * Se ejecutan en el navegador sobre la tabla ya cargada, con los mismos cálculos que los gráficos.
 */
import { agregacionDe, type Fila, type Tabla } from "@/lib/analisis";
import { correlacion, mesLargo, porCategoria, serieTemporal, texto, valorDe, type Calculo, type Periodo } from "@/lib/calculo";
import { aplicarFiltros, type Filtros } from "@/lib/hallazgos";

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
  description: "Filtros adicionales solo para este cálculo: { columna: [valores exactos] }. No cambia el dashboard.",
  additionalProperties: { type: "array", items: { type: "string" } },
};

export const DEFINICIONES = [
  {
    type: "function",
    function: {
      name: "resumen_tabla",
      description: "Resumen general: cantidad de registros, totales y promedios de cada medida, rango de fechas y filtros activos del dashboard.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "agregar_por_categoria",
      description: "Calcula una medida agrupada por una columna categórica (ranking por región, segmento, estado, etc.).",
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
      description: "Evolución de una medida en el tiempo (por día, semana, mes, trimestre o año).",
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
        const total = c === "sum" || c === "count" ? barras.reduce((s, b) => s + (Number.isFinite(b.valor) ? b.valor : 0), 0) : null;
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
