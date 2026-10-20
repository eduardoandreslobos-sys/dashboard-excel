"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Crown, Filter, HeartPulse, Link2, Sparkles, TrendingUp } from "lucide-react";
import { useDash, useFilasExcepto } from "../Contexto";
import { Estado, Panel, Rico, Segmentado, Selector } from "../ui";
import { agregacionDe, columna, type Fila, type Tabla } from "@/lib/analisis";
import { fechaCorta, formato, mesLargo, PERIODOS, porCategoria, serieTemporal, texto, type Periodo, type Punto } from "@/lib/calculo";
import { hallazgos, type Hallazgo } from "@/lib/hallazgos";
import {
  ApiladoComposicion,
  AreaTendencia,
  BarrasRanking,
  colorPorEntidad,
  KpiHero,
  RadialSalud,
  type Delta,
  type GrupoSalud,
  type Rango,
} from "../charts";

export const nombreMedida = (tabla: Tabla, m: string | null) =>
  !m ? "Registros" : `${agregacionDe(tabla, m) === "mean" ? "Promedio" : "Total"} ${m}`;

/** Colores por valor de estado (tono semántico) o por posición fija de la paleta (variables CSS). */
export function coloresDe(tabla: Tabla, cat: string, valores: string[]): Record<string, string> {
  const color = colorPorEntidad(tabla, cat);
  return Object.fromEntries(valores.map((v) => [v, color(v)]));
}

const esMedia = (tabla: Tabla, m: string | null) => !!m && agregacionDe(tabla, m) === "mean";

// ---------------------------------------------------------------- KPIs

interface Tarjeta {
  clave: string;
  etiqueta: string;
  valor: number;
  decimales: boolean;
  tendencia?: Punto[];
  delta?: Delta;
  detalle?: string;
}

const suma = (filas: Fila[], m: string) => filas.reduce((s, f) => s + (typeof f[m] === "number" ? (f[m] as number) : 0), 0);
function promedio(filas: Fila[], m: string) {
  const v = filas.map((f) => f[m]).filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
}

function useTarjetas(tabla: Tabla, filas: Fila[]): Tarjeta[] {
  return useMemo(() => {
    const principal = tabla.medidaPrincipal;
    const sumas = tabla.medidas.filter((m) => agregacionDe(tabla, m) === "sum").sort((a, b) => Number(b === principal) - Number(a === principal));
    const promedios = tabla.medidas.filter((m) => agregacionDe(tabla, m) === "mean");
    // La medida principal (si se suma) va primero: es la cifra héroe.
    const lista: (string | null)[] = [...sumas.slice(0, 1), ...(tabla.esDetalle ? [null] : []), ...sumas.slice(1, 3), ...promedios.slice(0, 4)];
    const fecha = tabla.esDetalle ? tabla.fechas[0] : undefined;
    return lista.slice(0, 8).map((m) => {
      const media = esMedia(tabla, m);
      const valor = m ? (media ? promedio(filas, m) : suma(filas, m)) : filas.length;
      const t: Tarjeta = { clave: m ?? "__registros", etiqueta: nombreMedida(tabla, m), valor, decimales: media };
      if (fecha) {
        const serie = serieTemporal(tabla, filas, fecha, "mes", m);
        if (serie.length >= 3) {
          t.tendencia = serie;
          const [a, b] = serie.slice(-2);
          if (Number.isFinite(a.valor) && Number.isFinite(b.valor) && a.valor) {
            const cambio = media ? b.valor - a.valor : (b.valor / a.valor - 1) * 100;
            t.delta = {
              texto: media ? `${cambio >= 0 ? "+" : ""}${formato(cambio)} pts` : `${cambio >= 0 ? "+" : ""}${formato(cambio)} %`,
              sentido: media || Math.abs(cambio) < 0.05 ? "neutro" : cambio > 0 ? "sube" : "baja",
            };
            t.detalle = `${mesLargo(new Date(b.t))} vs mes anterior`;
          }
        }
      }
      return t;
    });
  }, [tabla, filas]);
}

function KPIs({ tabla, filas }: { tabla: Tabla; filas: Fila[] }) {
  const tarjetas = useTarjetas(tabla, filas);
  const [heroe, ...resto] = tarjetas;
  if (!heroe) return null;
  const junto = resto.slice(0, 4);
  const extra = resto.slice(4);
  return (
    <div className="flex flex-col" style={{ gap: "var(--gap)" }}>
      <div className="grid grid-cols-2 xl:grid-cols-4" style={{ gap: "var(--gap)" }}>
        <div className={`col-span-2 ${junto.length > 2 ? "xl:row-span-2" : ""} [&>div]:h-full`}>
          <KpiHero {...heroe} grande />
        </div>
        {junto.map((k) => (
          <KpiHero key={k.clave} {...k} />
        ))}
      </div>
      {extra.length > 0 && (
        <div className={`grid grid-cols-2 ${["", "xl:grid-cols-1", "xl:grid-cols-2", "md:grid-cols-3", "xl:grid-cols-4"][extra.length]}`} style={{ gap: "var(--gap)" }}>
          {extra.map((k) => (
            <KpiHero key={k.clave} {...k} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Hallazgos

const ICONO_HALLAZGO: Record<Hallazgo["tipo"], typeof Sparkles> = {
  concentracion: Crown,
  extremo: Sparkles,
  tendencia: TrendingUp,
  relacion: Link2,
  riesgo: AlertTriangle,
};

function Hallazgos({ tabla, filas, medida, className }: { tabla: Tabla; filas: Fila[]; medida: string | null; className?: string }) {
  const { alternarFiltro, filtros } = useDash();
  const notas = useMemo(() => hallazgos(tabla, filas, medida), [tabla, filas, medida]);
  if (!notas.length) return null;
  return (
    <Panel
      className={className}
      titulo={
        <span className="inline-flex items-center gap-1.5">
          <Sparkles size={15} className="text-accent" aria-hidden /> Hallazgos clave
        </span>
      }
      subtitulo="Calculados automáticamente con los filtros actuales"
    >
      <ul className="flex flex-col gap-3">
        {notas.map((n, i) => {
          const Icono = ICONO_HALLAZGO[n.tipo];
          const activo = n.accion && (filtros.categorias[n.accion.columna] ?? []).includes(n.accion.valor);
          return (
            <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-ink-2">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-3">
                <Icono size={13} aria-hidden />
              </span>
              <div className="min-w-0">
                <Rico texto={n.texto} />
                {n.accion && (
                  <button
                    type="button"
                    onClick={() => alternarFiltro(n.accion!.columna, n.accion!.valor)}
                    className="ml-1.5 inline-flex items-center gap-0.5 text-[12px] font-medium text-accent hover:underline"
                  >
                    {activo ? "Quitar filtro" : `Ver ${n.accion.valor}`} <ArrowRight size={12} aria-hidden />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

// ---------------------------------------------------------------- piezas compartidas

/** Barras de una categoría, con clic para filtrar el dashboard completo. */
export function BarrasCategoria({
  tabla,
  filas,
  cat,
  medida,
  alto,
}: {
  tabla: Tabla;
  filas: Fila[];
  cat: string;
  medida: string | null;
  alto?: number;
}) {
  const { filtros, alternarFiltro } = useDash();
  const base = useFilasExcepto(cat);
  const fuente = filtros.categorias[cat]?.length ? base : filas;
  const barras = useMemo(() => porCategoria(tabla, fuente, cat, medida).slice(0, 15), [tabla, fuente, cat, medida]);
  const colorDe = useMemo(() => (columna(tabla, cat)?.tonos ? colorPorEntidad(tabla, cat) : undefined), [tabla, cat]);
  return (
    <BarrasRanking
      barras={barras}
      nombre={nombreMedida(tabla, medida)}
      etiqueta={`${nombreMedida(tabla, medida)} por ${cat}`}
      seleccionados={filtros.categorias[cat]}
      onSeleccionar={(v) => alternarFiltro(cat, v)}
      colorDe={colorDe}
      sumable={!esMedia(tabla, medida)}
      alto={alto}
    />
  );
}

/** Agrupa los valores de la columna de estado por tono (al día, en riesgo…). */
function useGruposSalud(tabla: Tabla, filas: Fila[]): GrupoSalud[] {
  return useMemo(() => {
    const estado = tabla.estado;
    const tonos = estado ? columna(tabla, estado).tonos : undefined;
    if (!estado || !tonos) return [];
    const grupos = new Map<string, GrupoSalud>();
    for (const b of porCategoria(tabla, filas, estado, null)) {
      const tono = tonos[b.etiqueta] ?? "neutro";
      const g = grupos.get(tono) ?? { tono, valores: [], n: 0 };
      g.valores.push(b.etiqueta);
      g.n += b.n;
      grupos.set(tono, g);
    }
    return [...grupos.values()];
  }, [tabla, filas]);
}

function SaludCartera({ tabla, className }: { tabla: Tabla; className?: string }) {
  const { setFiltro, filtros } = useDash();
  const estado = tabla.estado!;
  const base = useFilasExcepto(estado);
  const grupos = useGruposSalud(tabla, base);
  if (!grupos.length) return null;
  const sel = filtros.categorias[estado] ?? [];
  return (
    <Panel
      className={className}
      titulo={
        <span className="inline-flex items-center gap-1.5">
          <HeartPulse size={15} className="text-accent" aria-hidden /> Salud por {estado.toLowerCase()}
        </span>
      }
      subtitulo="Clic en un tramo del anillo para filtrar el dashboard"
    >
      <RadialSalud
        grupos={grupos}
        etiqueta={`Distribución de registros por ${estado}`}
        onSeleccionar={(valores) => setFiltro(estado, valores.every((v) => sel.includes(v)) && sel.length === valores.length ? [] : valores)}
      />
    </Panel>
  );
}

// ---------------------------------------------------------------- Resumen

export function Resumen() {
  const { tabla, filas, medida, setVista } = useDash();
  if (!tabla) return null;
  if (!tabla.esDetalle) return <ResumenAgregado tabla={tabla} filas={filas} />;

  const fecha = tabla.fechas[0];
  const usable = (c: string) => c !== tabla.estado && columna(tabla, c).unicos >= 2 && columna(tabla, c).unicos <= 15;
  const cats = tabla.categorias.filter(usable);
  const cat = cats.find((c) => columna(tabla, c).unicos >= 3) ?? cats[0] ?? tabla.categorias[0];
  const otra = cats.find((c) => c !== cat);
  const corta = tabla.categorias.find((c) => c !== tabla.estado && columna(tabla, c).unicos >= 2 && columna(tabla, c).unicos <= 8);
  const desglose = tabla.estado ?? corta;
  const hayEstado = !!tabla.estado && !!columna(tabla, tabla.estado).tonos;

  return (
    <div className="flex flex-col" style={{ gap: "var(--gap)" }}>
      <KPIs tabla={tabla} filas={filas} />

      <div className="grid grid-cols-1 xl:grid-cols-3" style={{ gap: "var(--gap)" }}>
        {fecha && medida && (
          <Panel
            className="xl:col-span-2"
            titulo={`${nombreMedida(tabla, medida)} por mes`}
            subtitulo="▲ máximo · ▼ mínimo · línea punteada = promedio del periodo"
            acciones={
              <button type="button" className="ctl" onClick={() => setVista("tendencias")}>
                Ver tendencias <ArrowRight size={14} aria-hidden />
              </button>
            }
          >
            <TendenciaPrincipal tabla={tabla} filas={filas} medida={medida} fecha={fecha} periodo="mes" alto={340} />
          </Panel>
        )}
        {hayEstado ? <SaludCartera tabla={tabla} /> : <Hallazgos tabla={tabla} filas={filas} medida={medida} />}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3" style={{ gap: "var(--gap)" }}>
        {fecha && desglose && (
          <Panel
            className="xl:col-span-2"
            titulo={`Composición por ${desglose.toLowerCase()} en el tiempo`}
            subtitulo={hayEstado ? "Proporción de registros de cada mes en cada estado" : "Registros de cada mes, separados por categoría"}
          >
            <Composicion tabla={tabla} filas={filas} fecha={fecha} periodo="mes" cat={desglose} modo={hayEstado ? "100" : "apilado"} alto={300} />
          </Panel>
        )}
        {hayEstado ? (
          <Hallazgos tabla={tabla} filas={filas} medida={medida} />
        ) : (
          <div className="flex min-w-0 flex-col" style={{ gap: "var(--gap)" }}>
            {[cat, otra].map(
              (c) =>
                c && (
                  <Panel key={c} titulo={`${nombreMedida(tabla, medida)} por ${c}`} subtitulo="Clic en una barra para filtrar todo el dashboard">
                    <BarrasCategoria tabla={tabla} filas={filas} cat={c} medida={medida} />
                  </Panel>
                ),
            )}
          </div>
        )}
      </div>

      {hayEstado && (
        <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: "var(--gap)" }}>
          {cat && (
            <Panel
              titulo={`${nombreMedida(tabla, medida)} por ${cat}`}
              subtitulo="Clic en una barra para filtrar todo el dashboard"
              acciones={
                <button type="button" className="ctl" onClick={() => setVista("segmentos")}>
                  Todos los segmentos <ArrowRight size={14} aria-hidden />
                </button>
              }
            >
              <BarrasCategoria tabla={tabla} filas={filas} cat={cat} medida={medida} />
            </Panel>
          )}
          <Panel titulo={`Registros por ${tabla.estado}`} subtitulo="Clic en una barra para filtrar todo el dashboard">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {Object.entries(columna(tabla, tabla.estado!).tonos ?? {}).map(([v, tono]) => (
                <Estado key={v} tono={tono} texto={v} />
              ))}
            </div>
            <BarrasCategoria tabla={tabla} filas={filas} cat={tabla.estado!} medida={null} />
          </Panel>
        </div>
      )}
    </div>
  );
}

function TendenciaPrincipal({
  tabla,
  filas,
  medida,
  fecha,
  periodo,
  alto,
  brush,
  onRango,
}: {
  tabla: Tabla;
  filas: Fila[];
  medida: string;
  fecha: string;
  periodo: Periodo;
  alto?: number;
  brush?: boolean;
  onRango?: (r: Rango, serie: Punto[]) => void;
}) {
  const serie = useMemo(() => serieTemporal(tabla, filas, fecha, periodo, medida), [tabla, filas, fecha, periodo, medida]);
  return (
    <AreaTendencia
      puntos={serie}
      nombre={nombreMedida(tabla, medida)}
      etiqueta={`${nombreMedida(tabla, medida)} en el tiempo`}
      sumable={!esMedia(tabla, medida)}
      alto={alto}
      brush={brush}
      onRango={onRango ? (r) => onRango(r, serie) : undefined}
    />
  );
}

function ResumenAgregado({ tabla, filas }: { tabla: Tabla; filas: Fila[] }) {
  const etiqueta = tabla.categorias[0] ?? tabla.columnas.find((c) => c.rol !== "medida")?.nombre ?? tabla.columnas[0].nombre;
  return (
    <div className="flex flex-col" style={{ gap: "var(--gap)" }}>
      <KPIs tabla={tabla} filas={filas} />
      <p className="text-[13px] text-ink-3">
        Esta tabla ya viene resumida por <strong className="text-ink-2">{etiqueta}</strong>: se grafica cada columna numérica tal cual.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: "var(--gap)" }}>
        {tabla.medidas.map((m) => (
          <Panel key={m} titulo={m}>
            <BarrasAgregado tabla={tabla} filas={filas} etiqueta={etiqueta} medida={m} />
          </Panel>
        ))}
      </div>
    </div>
  );
}

function BarrasAgregado({ tabla, filas, etiqueta, medida }: { tabla: Tabla; filas: Fila[]; etiqueta: string; medida: string }) {
  const barras = useMemo(
    () => filas.map((f) => ({ etiqueta: texto(f[etiqueta]), valor: f[medida] as number, n: 1 })).filter((b) => Number.isFinite(b.valor)).sort((a, b) => b.valor - a.valor),
    [filas, etiqueta, medida],
  );
  const media = esMedia(tabla, medida);
  return <BarrasRanking barras={barras} nombre={medida} etiqueta={`${medida} por ${etiqueta}`} sumable={!media} colorDe={() => (media ? "var(--s2)" : "var(--s1)")} />;
}

// ---------------------------------------------------------------- Tendencias

export function Tendencias() {
  const { tabla, filas, medida, periodo, setPeriodo, setRango } = useDash();
  const [fecha, setFecha] = useState<string | null>(null);
  const [modo, setModo] = useState<"apilado" | "100">("apilado");
  const [rango, setRangoLocal] = useState<{ desde: number; hasta: number; texto: string } | null>(null);
  const cortas = useMemo(
    () => (tabla ? tabla.categorias.filter((c) => { const n = new Set(filas.map((f) => f[c])).size; return n >= 2 && n <= 8; }) : []),
    [tabla, filas],
  );
  const [desglose, setDesglose] = useState<string | null>(null);
  if (!tabla || !tabla.fechas.length) return null;
  const col = fecha && tabla.fechas.includes(fecha) ? fecha : tabla.fechas[0];
  const cat = desglose && cortas.includes(desglose) ? desglose : (tabla.estado && cortas.includes(tabla.estado) ? tabla.estado : cortas[0]);

  const elegirRango = ({ desde, hasta }: Rango, serie: Punto[]) => {
    if (desde <= 0 && hasta >= serie.length - 1) return setRangoLocal(null);
    const fin = serie[hasta + 1]?.t ?? Math.max(...filas.map((f) => (f[col] instanceof Date ? (f[col] as Date).getTime() : 0))) + 1;
    setRangoLocal({ desde: serie[desde].t, hasta: fin - 1, texto: `${serie[desde].etiqueta} – ${serie[hasta].etiqueta}` });
  };

  return (
    <div className="flex flex-col" style={{ gap: "var(--gap)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <Segmentado
          etiqueta="Periodo"
          opciones={(Object.keys(PERIODOS) as Periodo[]).map((p) => ({ valor: p, texto: PERIODOS[p] }))}
          valor={periodo}
          onChange={(p) => {
            setPeriodo(p);
            setRangoLocal(null);
          }}
        />
        {tabla.fechas.length > 1 && (
          <Selector etiqueta="Fecha" valor={col} opciones={tabla.fechas.map((f) => ({ valor: f, texto: f }))} onChange={setFecha} />
        )}
      </div>
      {medida && (
        <Panel
          titulo={`${nombreMedida(tabla, medida)} por ${PERIODOS[periodo].toLowerCase()}`}
          subtitulo="▲ máximo · ▼ mínimo · línea punteada = promedio · arrastra los bordes de la barra inferior para elegir un rango"
          acciones={
            rango && (
              <button
                type="button"
                className="ctl ctl-primary"
                onClick={() => {
                  setRango(col, [rango.desde, rango.hasta]);
                  setRangoLocal(null);
                }}
                title={`${fechaCorta(new Date(rango.desde))} → ${fechaCorta(new Date(rango.hasta))}`}
              >
                <Filter size={14} aria-hidden /> Filtrar {rango.texto}
              </button>
            )
          }
        >
          <TendenciaPrincipal key={`${col}-${periodo}`} tabla={tabla} filas={filas} medida={medida} fecha={col} periodo={periodo} alto={360} brush onRango={elegirRango} />
        </Panel>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-3" style={{ gap: "var(--gap)" }}>
        <Panel className={cat ? "" : "xl:col-span-3"} titulo={`Registros por ${PERIODOS[periodo].toLowerCase()}`}>
          <SerieConteo tabla={tabla} filas={filas} fecha={col} periodo={periodo} />
        </Panel>
        {cat && (
          <Panel
            className="xl:col-span-2"
            titulo={`Composición por ${cat}`}
            subtitulo={modo === "100" ? "Proporción de cada categoría en cada periodo" : "Registros de cada periodo, separados por categoría"}
            acciones={
              <>
                <Segmentado
                  etiqueta="Escala"
                  valor={modo}
                  onChange={setModo}
                  opciones={[
                    { valor: "apilado", texto: "Cantidad" },
                    { valor: "100", texto: "100 %" },
                  ]}
                />
                <Selector etiqueta="Desglosar por" valor={cat} opciones={cortas.map((c) => ({ valor: c, texto: c }))} onChange={setDesglose} />
              </>
            }
          >
            <Composicion tabla={tabla} filas={filas} fecha={col} periodo={periodo} cat={cat} modo={modo} alto={340} />
          </Panel>
        )}
      </div>
    </div>
  );
}

function SerieConteo({ tabla, filas, fecha, periodo }: { tabla: Tabla; filas: Fila[]; fecha: string; periodo: Periodo }) {
  const serie = useMemo(() => serieTemporal(tabla, filas, fecha, periodo, null), [tabla, filas, fecha, periodo]);
  return (
    <ApiladoComposicion
      etiquetas={serie.map((p) => p.etiqueta)}
      series={[{ nombre: "Registros", color: "var(--s1)", datos: serie.map((p) => p.valor) }]}
      etiqueta="Registros en el tiempo"
      alto={340}
    />
  );
}

const ORDEN_TONO = ["bueno", "alerta", "serio", "critico", "neutro"];

/** Orden de apilado que no cambia al filtrar: por tono (estados) o por frecuencia en toda la tabla. */
function ordenEstable(tabla: Tabla, cat: string, presentes: Set<string>): string[] {
  const tonos = columna(tabla, cat).tonos;
  const global = porCategoria(tabla, tabla.filas, cat, null).map((b) => b.etiqueta);
  const orden = tonos ? [...global].sort((a, b) => ORDEN_TONO.indexOf(tonos[a] ?? "neutro") - ORDEN_TONO.indexOf(tonos[b] ?? "neutro")) : global;
  return orden.filter((v) => presentes.has(v));
}

function Composicion({
  tabla,
  filas,
  fecha,
  periodo,
  cat,
  modo,
  alto,
}: {
  tabla: Tabla;
  filas: Fila[];
  fecha: string;
  periodo: Periodo;
  cat: string;
  modo: "apilado" | "100";
  alto?: number;
}) {
  const datos = useMemo(() => {
    const base = serieTemporal(tabla, filas, fecha, periodo, null);
    const valores = ordenEstable(tabla, cat, new Set(filas.map((f) => texto(f[cat]))));
    const color = colorPorEntidad(tabla, cat);
    const series = valores.map((v) => {
      const sub = filas.filter((f) => texto(f[cat]) === v);
      const s = new Map(serieTemporal(tabla, sub, fecha, periodo, null).map((p) => [p.t, p.valor]));
      return { nombre: v, color: color(v), datos: base.map((p) => s.get(p.t) ?? 0) };
    });
    return { etiquetas: base.map((p) => p.etiqueta), series };
  }, [tabla, filas, fecha, periodo, cat]);
  return <ApiladoComposicion etiquetas={datos.etiquetas} series={datos.series} modo={modo} etiqueta={`Composición por ${cat}`} alto={alto} />;
}
