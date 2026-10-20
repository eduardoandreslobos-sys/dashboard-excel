"use client";

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Crown, Link2, Sparkles, TrendingUp } from "lucide-react";
import Grafico, { type Tokens } from "../Grafico";
import { useDash, useFilasExcepto } from "../Contexto";
import { Estado, Grilla, KPI, Panel, Rico, Segmentado, Selector } from "../ui";
import { agregacionDe, columna, type Fila, type Tabla } from "@/lib/analisis";
import { formato, mesLargo, PERIODOS, porCategoria, serieTemporal, texto, type Periodo } from "@/lib/calculo";
import { hallazgos, type Hallazgo } from "@/lib/hallazgos";
import { apiladas, barrasH, columnas, linea } from "@/lib/opciones";

export const nombreMedida = (tabla: Tabla, m: string | null) =>
  !m ? "Registros" : `${agregacionDe(tabla, m) === "mean" ? "Promedio" : "Total"} ${m}`;

/** Colores por valor de estado (tono semántico) o por posición fija de la paleta. */
export function coloresDe(tabla: Tabla, cat: string, valores: string[], t: Tokens): Record<string, string> {
  const tonos = columna(tabla, cat)?.tonos;
  const mapa: Record<string, string> = {};
  const porTono = { bueno: t.ok, alerta: t.warn, serio: t.serious, critico: t.critical, neutro: t.neutral };
  const orden = [...new Set(tabla.filas.map((f) => texto(f[cat])))].sort();
  valores.forEach((v) => {
    mapa[v] = tonos ? porTono[tonos[v] ?? "neutro"] : t.series[orden.indexOf(v) % 8];
  });
  return mapa;
}

function KPIs({ tabla, filas }: { tabla: Tabla; filas: Fila[] }) {
  const tarjetas = useMemo(() => {
    const principal = tabla.medidaPrincipal;
    const sumas = tabla.medidas.filter((m) => agregacionDe(tabla, m) === "sum").sort((a, b) => Number(b === principal) - Number(a === principal));
    const promedios = tabla.medidas.filter((m) => agregacionDe(tabla, m) === "mean");
    const lista: (string | null)[] = [...(tabla.esDetalle ? [null] : []), ...sumas.slice(0, 3), ...promedios.slice(0, 4)];
    const fecha = tabla.esDetalle ? tabla.fechas[0] : undefined;
    return lista.slice(0, 8).map((m) => {
      const valor = m ? (agregacionDe(tabla, m) === "mean" ? promedio(filas, m) : suma(filas, m)) : filas.length;
      let tendencia: number[] | undefined;
      let delta: string | undefined;
      let detalle: string | undefined;
      let sentido: "sube" | "baja" | "neutro" | undefined;
      if (fecha) {
        const serie = serieTemporal(tabla, filas, fecha, "mes", m);
        if (serie.length >= 3) {
          tendencia = serie.map((p) => p.valor);
          const [a, b] = serie.slice(-2);
          if (Number.isFinite(a.valor) && Number.isFinite(b.valor) && a.valor) {
            const media = m && agregacionDe(tabla, m) === "mean";
            const cambio = media ? b.valor - a.valor : (b.valor / a.valor - 1) * 100;
            delta = media ? `${cambio >= 0 ? "+" : ""}${formato(cambio)} pts` : `${cambio >= 0 ? "+" : ""}${formato(cambio)} %`;
            sentido = media ? "neutro" : cambio >= 0 ? "sube" : "baja";
            detalle = `${mesLargo(new Date(b.t))} vs mes anterior`;
          }
        }
      }
      return { etiqueta: nombreMedida(tabla, m), valor: formato(valor), tendencia, delta, detalle, sentido };
    });
  }, [tabla, filas]);
  return (
    <Grilla columnas={4}>
      {tarjetas.map((k) => (
        <KPI key={k.etiqueta} {...k} />
      ))}
    </Grilla>
  );
}

const suma = (filas: Fila[], m: string) => filas.reduce((s, f) => s + (typeof f[m] === "number" ? (f[m] as number) : 0), 0);
function promedio(filas: Fila[], m: string) {
  const v = filas.map((f) => f[m]).filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
}

const ICONO_HALLAZGO: Record<Hallazgo["tipo"], typeof Sparkles> = {
  concentracion: Crown,
  extremo: Sparkles,
  tendencia: TrendingUp,
  relacion: Link2,
  riesgo: AlertTriangle,
};

function Hallazgos({ tabla, filas, medida }: { tabla: Tabla; filas: Fila[]; medida: string | null }) {
  const { alternarFiltro, filtros } = useDash();
  const notas = useMemo(() => hallazgos(tabla, filas, medida), [tabla, filas, medida]);
  if (!notas.length) return null;
  return (
    <Panel
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
  const sel = filtros.categorias[cat];
  const opcion = useCallback(
    (t: Tokens) =>
      barrasH(t, barras, {
        nombre: nombreMedida(tabla, medida),
        seleccionados: sel,
        colores: columna(tabla, cat)?.tonos ? coloresDe(tabla, cat, barras.map((b) => b.etiqueta), t) : undefined,
        total: medida && agregacionDe(tabla, medida) === "mean" ? 0 : undefined,
      }),
    [barras, tabla, medida, sel, cat],
  );
  const clic = useCallback((e: { name?: string }) => e.name && alternarFiltro(cat, e.name), [alternarFiltro, cat]);
  return <Grafico opcion={opcion} onClick={clic} alto={alto ?? Math.max(160, barras.length * 30 + 20)} etiqueta={`${nombreMedida(tabla, medida)} por ${cat}`} />;
}

export function Resumen() {
  const { tabla, filas, medida, setVista } = useDash();
  if (!tabla) return null;
  if (!tabla.esDetalle) return <ResumenAgregado tabla={tabla} filas={filas} />;

  const fecha = tabla.fechas[0];
  const cat = tabla.categorias.find((c) => c !== tabla.estado && columna(tabla, c).unicos >= 3 && columna(tabla, c).unicos <= 15) ?? tabla.categorias[0];
  return (
    <div className="flex flex-col" style={{ gap: "var(--gap)" }}>
      <KPIs tabla={tabla} filas={filas} />
      <div className="grid grid-cols-1 xl:grid-cols-3" style={{ gap: "var(--gap)" }}>
        <div className="xl:col-span-1">
          <Hallazgos tabla={tabla} filas={filas} medida={medida} />
        </div>
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
            <TendenciaPrincipal tabla={tabla} filas={filas} medida={medida} fecha={fecha} periodo="mes" />
          </Panel>
        )}
      </div>
      <Grilla columnas={2}>
        {tabla.estado && (
          <Panel titulo={`Registros por ${tabla.estado}`} subtitulo="Clic en una barra para filtrar todo el dashboard">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {Object.entries(columna(tabla, tabla.estado).tonos ?? {}).map(([v, tono]) => (
                <Estado key={v} tono={tono} texto={v} />
              ))}
            </div>
            <BarrasCategoria tabla={tabla} filas={filas} cat={tabla.estado} medida={null} />
          </Panel>
        )}
        {cat && (
          <Panel titulo={`${nombreMedida(tabla, medida)} por ${cat}`} subtitulo="Clic en una barra para filtrar todo el dashboard"
            acciones={<button type="button" className="ctl" onClick={() => setVista("segmentos")}>Todos los segmentos <ArrowRight size={14} aria-hidden /></button>}>
            <BarrasCategoria tabla={tabla} filas={filas} cat={cat} medida={medida} />
          </Panel>
        )}
      </Grilla>
    </div>
  );
}

function TendenciaPrincipal({ tabla, filas, medida, fecha, periodo }: { tabla: Tabla; filas: Fila[]; medida: string; fecha: string; periodo: Periodo }) {
  const serie = useMemo(() => serieTemporal(tabla, filas, fecha, periodo, medida), [tabla, filas, fecha, periodo, medida]);
  const opcion = useCallback((t: Tokens) => linea(t, serie, nombreMedida(tabla, medida)), [serie, tabla, medida]);
  return <Grafico opcion={opcion} etiqueta={`${nombreMedida(tabla, medida)} en el tiempo`} />;
}

function ResumenAgregado({ tabla, filas }: { tabla: Tabla; filas: Fila[] }) {
  const etiqueta = tabla.categorias[0] ?? tabla.columnas.find((c) => c.rol !== "medida")?.nombre ?? tabla.columnas[0].nombre;
  return (
    <div className="flex flex-col" style={{ gap: "var(--gap)" }}>
      <KPIs tabla={tabla} filas={filas} />
      <p className="text-[13px] text-ink-3">
        Esta tabla ya viene resumida por <strong className="text-ink-2">{etiqueta}</strong>: se grafica cada columna numérica tal cual.
      </p>
      <Grilla columnas={2}>
        {tabla.medidas.map((m) => (
          <Panel key={m} titulo={m}>
            <BarrasAgregado tabla={tabla} filas={filas} etiqueta={etiqueta} medida={m} />
          </Panel>
        ))}
      </Grilla>
    </div>
  );
}

function BarrasAgregado({ tabla, filas, etiqueta, medida }: { tabla: Tabla; filas: Fila[]; etiqueta: string; medida: string }) {
  const barras = useMemo(
    () => filas.map((f) => ({ etiqueta: texto(f[etiqueta]), valor: f[medida] as number, n: 1 })).filter((b) => Number.isFinite(b.valor)).sort((a, b) => b.valor - a.valor),
    [filas, etiqueta, medida],
  );
  const media = agregacionDe(tabla, medida) === "mean";
  const opcion = useCallback((t: Tokens) => barrasH(t, barras, { nombre: medida, total: media ? 0 : undefined, color: media ? t.series[1] : t.series[0] }), [barras, medida, media]);
  return <Grafico opcion={opcion} alto={Math.max(160, barras.length * 30 + 20)} etiqueta={`${medida} por ${etiqueta}`} />;
}

// ---------------------------------------------------------------- Tendencias

export function Tendencias() {
  const { tabla, filas, medida, periodo, setPeriodo } = useDash();
  const [fecha, setFecha] = useState<string | null>(null);
  const cortas = useMemo(
    () => (tabla ? tabla.categorias.filter((c) => { const n = new Set(filas.map((f) => f[c])).size; return n >= 2 && n <= 8; }) : []),
    [tabla, filas],
  );
  const [desglose, setDesglose] = useState<string | null>(null);
  if (!tabla || !tabla.fechas.length) return null;
  const col = fecha && tabla.fechas.includes(fecha) ? fecha : tabla.fechas[0];
  const cat = desglose && cortas.includes(desglose) ? desglose : (tabla.estado && cortas.includes(tabla.estado) ? tabla.estado : cortas[0]);

  return (
    <div className="flex flex-col" style={{ gap: "var(--gap)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <Segmentado
          etiqueta="Periodo"
          opciones={(Object.keys(PERIODOS) as Periodo[]).map((p) => ({ valor: p, texto: PERIODOS[p] }))}
          valor={periodo}
          onChange={setPeriodo}
        />
        {tabla.fechas.length > 1 && (
          <Selector etiqueta="Fecha" valor={col} opciones={tabla.fechas.map((f) => ({ valor: f, texto: f }))} onChange={setFecha} />
        )}
      </div>
      <Grilla columnas={2}>
        <Panel titulo={`Registros por ${PERIODOS[periodo].toLowerCase()}`}>
          <SerieConteo tabla={tabla} filas={filas} fecha={col} periodo={periodo} />
        </Panel>
        {medida && (
          <Panel titulo={`${nombreMedida(tabla, medida)} por ${PERIODOS[periodo].toLowerCase()}`} subtitulo="▲ máximo · ▼ mínimo · línea punteada = promedio">
            <TendenciaPrincipal tabla={tabla} filas={filas} medida={medida} fecha={col} periodo={periodo} />
          </Panel>
        )}
      </Grilla>
      {cat && (
        <Panel
          titulo={`Composición por ${cat}`}
          subtitulo="Registros de cada periodo, separados por categoría"
          acciones={<Selector etiqueta="Desglosar por" valor={cat} opciones={cortas.map((c) => ({ valor: c, texto: c }))} onChange={setDesglose} />}
        >
          <Composicion tabla={tabla} filas={filas} fecha={col} periodo={periodo} cat={cat} />
        </Panel>
      )}
    </div>
  );
}

function SerieConteo({ tabla, filas, fecha, periodo }: { tabla: Tabla; filas: Fila[]; fecha: string; periodo: Periodo }) {
  const serie = useMemo(() => serieTemporal(tabla, filas, fecha, periodo, null), [tabla, filas, fecha, periodo]);
  const opcion = useCallback((t: Tokens) => columnas(t, serie, "Registros"), [serie]);
  return <Grafico opcion={opcion} etiqueta="Registros en el tiempo" />;
}

function Composicion({ tabla, filas, fecha, periodo, cat }: { tabla: Tabla; filas: Fila[]; fecha: string; periodo: Periodo; cat: string }) {
  const datos = useMemo(() => {
    const base = serieTemporal(tabla, filas, fecha, periodo, null);
    const valores = porCategoria(tabla, filas, cat, null).map((b) => b.etiqueta);
    const series = valores.map((v) => {
      const sub = filas.filter((f) => texto(f[cat]) === v);
      const s = new Map(serieTemporal(tabla, sub, fecha, periodo, null).map((p) => [p.t, p.valor]));
      return { nombre: v, datos: base.map((p) => s.get(p.t) ?? 0) };
    });
    return { etiquetas: base.map((p) => p.etiqueta), series };
  }, [tabla, filas, fecha, periodo, cat]);
  const opcion = useCallback(
    (t: Tokens) => {
      const colores = coloresDe(tabla, cat, datos.series.map((s) => s.nombre), t);
      return apiladas(t, datos.etiquetas, datos.series.map((s) => ({ ...s, color: colores[s.nombre] })));
    },
    [datos, tabla, cat],
  );
  return <Grafico opcion={opcion} alto={360} etiqueta={`Composición por ${cat}`} />;
}
