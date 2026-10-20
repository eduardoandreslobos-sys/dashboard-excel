"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import Grafico, { type Tokens } from "../Grafico";
import { useDash } from "../Contexto";
import { Estado, Panel, Selector } from "../ui";
import { nombreMedida } from "./Resumen";
import { agregacionDe, columna, descripcion, type Tabla } from "@/lib/analisis";
import { aCSV, formato, porCategoria, serieTemporal, texto, type Calculo } from "@/lib/calculo";
import { barrasH, linea } from "@/lib/opciones";

// ---------------------------------------------------------------- Explorador

const CALCULOS: { valor: Calculo; texto: string }[] = [
  { valor: "sum", texto: "Suma" },
  { valor: "mean", texto: "Promedio" },
  { valor: "median", texto: "Mediana" },
  { valor: "max", texto: "Máximo" },
  { valor: "min", texto: "Mínimo" },
];

export function Explorador() {
  const { tabla, filas, alternarFiltro, filtros } = useDash();
  const dims = tabla ? [...tabla.categorias, ...tabla.fechas] : [];
  const [dim, setDim] = useState(dims[0] ?? "");
  const [medida, setMedida] = useState("__registros");
  const [calculo, setCalculo] = useState<Calculo | "auto">("auto");
  const d = dims.includes(dim) ? dim : dims[0];
  const m = medida === "__registros" ? null : medida;
  const c: Calculo | undefined = !m ? undefined : calculo === "auto" ? agregacionDe(tabla!, m) : calculo;
  const esFecha = tabla?.fechas.includes(d) ?? false;

  const barras = useMemo(() => (tabla && d && !esFecha ? porCategoria(tabla, filas, d, m, c) : []), [tabla, filas, d, m, c, esFecha]);
  const serie = useMemo(() => (tabla && d && esFecha ? serieTemporal(tabla, filas, d, "mes", m, c) : []), [tabla, filas, d, m, c, esFecha]);
  const etiquetaCalc = m ? `${CALCULOS.find((x) => x.valor === c)?.texto} de ${m}` : "Registros";
  const opcion = useCallback(
    (t: Tokens) => (esFecha ? linea(t, serie, etiquetaCalc, t.series[0]) : barrasH(t, barras.slice(0, 30), { nombre: etiquetaCalc, seleccionados: filtros.categorias[d], total: c && c !== "sum" ? 0 : undefined })),
    [esFecha, serie, barras, etiquetaCalc, filtros, d, c],
  );
  const clic = useCallback((e: { name?: string }) => !esFecha && e.name && alternarFiltro(d, e.name), [esFecha, alternarFiltro, d]);
  if (!tabla || !d) return null;
  return (
    <Panel
      titulo="Arma tu propio gráfico"
      subtitulo="Elige qué agrupar, qué medir y cómo calcularlo"
      acciones={
        <>
          <Selector etiqueta="Agrupar por" valor={d} opciones={dims.map((x) => ({ valor: x, texto: x }))} onChange={setDim} />
          <Selector
            etiqueta="Medida"
            valor={medida}
            opciones={[{ valor: "__registros", texto: "Registros (conteo)" }, ...tabla.medidas.map((x) => ({ valor: x, texto: x }))]}
            onChange={setMedida}
          />
          {m && (
            <Selector
              etiqueta="Cálculo"
              valor={calculo}
              opciones={[{ valor: "auto" as const, texto: `Automático (${agregacionDe(tabla, m) === "mean" ? "promedio" : "suma"})` }, ...CALCULOS]}
              onChange={setCalculo}
            />
          )}
        </>
      }
    >
      <Grafico opcion={opcion} onClick={clic} alto={esFecha ? 420 : Math.max(240, Math.min(30, barras.length) * 28 + 20)} etiqueta={`${etiquetaCalc} por ${d}`} />
    </Panel>
  );
}

// ---------------------------------------------------------------- Datos

const POR_PAGINA = 50;

export function Datos() {
  const { tabla, filas, meta } = useDash();
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<{ col: string; asc: boolean } | null>(null);
  const [pagina, setPagina] = useState(0);

  const visibles = useMemo(() => {
    if (!tabla) return [];
    const q = busqueda.trim().toLowerCase();
    let res = q ? filas.filter((f) => tabla.columnas.some((c) => texto(f[c.nombre]).toLowerCase().includes(q))) : filas;
    if (orden) {
      const { col, asc } = orden;
      res = [...res].sort((a, b) => {
        const x = a[col], y = b[col];
        const vx = x instanceof Date ? x.getTime() : x, vy = y instanceof Date ? y.getTime() : y;
        if (vx === null) return 1;
        if (vy === null) return -1;
        return (vx < vy ? -1 : vx > vy ? 1 : 0) * (asc ? 1 : -1);
      });
    }
    return res;
  }, [tabla, filas, busqueda, orden]);

  const maximos = useMemo(() => {
    const m: Record<string, number> = {};
    tabla?.medidas.forEach((c) => (m[c] = Math.max(...filas.map((f) => Math.abs((f[c] as number) ?? 0)))));
    return m;
  }, [tabla, filas]);

  if (!tabla) return null;
  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const p = Math.min(pagina, paginas - 1);
  const cols = tabla.columnas.map((c) => c.nombre);

  const descargar = () => {
    const blob = new Blob([aCSV(visibles, cols)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(meta?.nombre ?? "datos").replace(/\.xlsx?$/i, "")}_filtrado.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Panel
      titulo={`${formato(visibles.length)} registros`}
      subtitulo="Busca en todas las columnas; clic en un encabezado para ordenar"
      acciones={
        <>
          <label className="ctl w-56 cursor-text">
            <Search size={14} className="text-ink-3" aria-hidden />
            <input
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setPagina(0); }}
              placeholder="Buscar…"
              className="w-full bg-transparent outline-none placeholder:text-ink-3"
              aria-label="Buscar en la tabla"
            />
          </label>
          <button type="button" className="ctl" onClick={descargar}>
            <Download size={14} aria-hidden /> CSV
          </button>
        </>
      }
    >
      <div className="-mx-[var(--pad)] overflow-x-auto border-y border-line">
        <table className="w-full min-w-max border-collapse text-[13px]">
          <thead className="sticky top-0 bg-surface-2">
            <tr>
              {tabla.columnas.map((c) => {
                const activo = orden?.col === c.nombre;
                return (
                  <th key={c.nombre} scope="col" className={`whitespace-nowrap px-3 py-2 font-medium text-ink-3 ${c.rol === "medida" ? "text-right" : "text-left"}`}>
                    <button
                      type="button"
                      onClick={() => setOrden({ col: c.nombre, asc: activo ? !orden!.asc : c.rol !== "medida" })}
                      className="inline-flex items-center gap-1 hover:text-ink"
                    >
                      {c.nombre}
                      {activo && (orden!.asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibles.slice(p * POR_PAGINA, (p + 1) * POR_PAGINA).map((f, i) => (
              <tr key={i} className="border-t border-line hover:bg-surface-hover">
                {tabla.columnas.map((c) => {
                  const v = f[c.nombre];
                  if (c.tonos && v !== null) return <td key={c.nombre} className="px-3 py-1.5"><Estado tono={c.tonos[texto(v)] ?? "neutro"} texto={texto(v)} /></td>;
                  if (c.rol === "medida" && typeof v === "number") {
                    const ancho = maximos[c.nombre] ? (Math.abs(v) / maximos[c.nombre]) * 100 : 0;
                    return (
                      <td key={c.nombre} className="px-3 py-1.5 text-right">
                        <div className="relative inline-flex min-w-[88px] justify-end">
                          <span className="absolute inset-y-0.5 right-0 rounded-sm bg-accent-soft" style={{ width: `${ancho}%` }} aria-hidden />
                          <span className="num relative text-ink">{formato(v)}</span>
                        </div>
                      </td>
                    );
                  }
                  return <td key={c.nombre} className={`whitespace-nowrap px-3 py-1.5 ${c.rol === "id" ? "num text-ink-3" : "text-ink-2"}`}>{texto(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-[12px] text-ink-3">
        <span>
          Página {p + 1} de {paginas}
        </span>
        <div className="flex gap-1">
          <button type="button" className="ctl h-7 px-2" disabled={p === 0} onClick={() => setPagina(p - 1)} aria-label="Página anterior">
            <ChevronLeft size={14} />
          </button>
          <button type="button" className="ctl h-7 px-2" disabled={p >= paginas - 1} onClick={() => setPagina(p + 1)} aria-label="Página siguiente">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- Cómo lo entendí

export function Lectura() {
  const { tablas, tabla, setTabla } = useDash();
  if (!tabla) return null;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3" style={{ gap: "var(--gap)" }}>
      <Panel titulo={`${tablas.length} tablas en ${new Set(tablas.map((t) => t.hoja)).size} hojas`} subtitulo="Clic para cambiar la tabla en pantalla">
        <ul className="flex flex-col gap-1">
          {tablas.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setTabla(t.id)}
                className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${t.id === tabla.id ? "bg-accent-soft" : "hover:bg-surface-hover"}`}
              >
                <p className={`text-[13px] font-medium ${t.id === tabla.id ? "text-accent" : "text-ink"}`}>{t.nombre}</p>
                <p className="text-[12px] text-ink-3">
                  {formato(t.filas.length)} filas × {t.columnas.length} columnas · {t.esDetalle ? "registros individuales" : "resumen agregado"}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel className="xl:col-span-2" titulo={`Columnas de «${tabla.nombre}»`} subtitulo={resumenLectura(tabla)}>
        <div className="-mx-[var(--pad)] overflow-x-auto border-t border-line">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-2 text-left text-ink-3">
              <tr>
                <th className="px-3 py-2 font-medium">Columna</th>
                <th className="px-3 py-2 font-medium">Interpretación</th>
                <th className="px-3 py-2 text-right font-medium">Valores distintos</th>
                <th className="px-3 py-2 font-medium">Ejemplo</th>
              </tr>
            </thead>
            <tbody>
              {tabla.columnas.map((c) => (
                <tr key={c.nombre} className="border-t border-line">
                  <td className="px-3 py-2 font-medium text-ink">{c.nombre}</td>
                  <td className="px-3 py-2 text-ink-2">
                    {descripcion(c)}
                    {c.nombre === tabla.medidaPrincipal && <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent">principal</span>}
                  </td>
                  <td className="num px-3 py-2 text-right text-ink-2">{formato(c.unicos)}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-ink-3">{texto(tabla.filas.find((f) => f[c.nombre] !== null)?.[c.nombre] ?? null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(tabla.jerarquias.length > 0 || tabla.estado || tabla.filasTotal > 0) && (
          <ul className="mt-4 flex flex-col gap-1.5 text-[13px] text-ink-2">
            {tabla.jerarquias.map((j) => (
              <li key={j.hijo}>
                ↳ Jerarquía detectada: cada <strong>{j.hijo}</strong> pertenece a una sola <strong>{j.padre}</strong> (habilita el drill-down).
              </li>
            ))}
            {tabla.estado && (
              <li className="flex flex-wrap items-center gap-1">
                ↳ <strong>{tabla.estado}</strong> se interpretó como estado:
                {Object.entries(columna(tabla, tabla.estado).tonos ?? {}).map(([v, t]) => <Estado key={v} tono={t} texto={v} />)}
              </li>
            )}
            {tabla.filasTotal > 0 && <li>↳ Se omitieron {tabla.filasTotal} fila(s) de «Total» para no contar doble.</li>}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function resumenLectura(t: Tabla): string {
  const n = (rol: string) => t.columnas.filter((c) => c.rol === rol).length;
  return [
    n("fecha") && `${n("fecha")} fecha(s)`,
    n("categoria") && `${n("categoria")} categoría(s)`,
    n("medida") && `${n("medida")} medida(s)`,
    n("id") && `${n("id")} identificador(es)`,
    t.medidaPrincipal && `medida principal: ${nombreMedida(t, t.medidaPrincipal)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
