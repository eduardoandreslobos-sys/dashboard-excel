"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Search, X } from "lucide-react";
import {
  columnFilteringFeature, createFilteredRowModel, createSortedRowModel, globalFilteringFeature, rowSortingFeature, tableFeatures,
  useTable, type ColumnDef, type ColumnFiltersState, type FilterFn, type SortFn, type SortingState,
} from "@tanstack/react-table";
import type { CellData, RowData, TableFeatures } from "@tanstack/table-core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import Grafico, { type Tokens } from "../Grafico";
import { useDash } from "../Contexto";
import { Estado, Panel, Selector } from "../ui";
import { nombreMedida } from "./Resumen";
import { agregacionDe, columna, descripcion, type Fila, type Rol, type Tabla, type Valor } from "@/lib/analisis";
import { aCSV, formato, porCategoria, serieTemporal, texto, type Calculo } from "@/lib/calculo";
import { barrasH, linea } from "@/lib/opciones";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

declare module "@tanstack/table-core" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<in out TFeatures extends TableFeatures, in out TData extends RowData, TValue extends CellData = CellData> {
    rol?: Rol;
  }
}

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

const FUNCIONES = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
});
type Funciones = typeof FUNCIONES;

const ALTO_FILA = 36;
const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const comparable = (v: Valor) => (v instanceof Date ? v.getTime() : v);

/** Nulos siempre al final; fechas por tiempo; números y textos en orden natural. */
const ordenar: SortFn<Funciones, Fila> = (a, b, id) => {
  const x = comparable(a.original[id]);
  const y = comparable(b.original[id]);
  if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
  if (typeof x === "number" && typeof y === "number") return x - y;
  return String(x).localeCompare(String(y), "es", { numeric: true });
};

/** Coincidencia sin tildes ni mayúsculas sobre el texto que se ve en la celda. */
const contiene: FilterFn<Funciones, Fila> = (fila, id, valor) => sinTildes(texto(fila.original[id])).includes(sinTildes(String(valor)));
contiene.resolveFilterValue = (v: unknown) => String(v ?? "").trim();

export function Datos() {
  const { tabla, filas, meta } = useDash();
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<SortingState>([]);
  const [filtrosCol, setFiltrosCol] = useState<ColumnFiltersState>([]);
  const contenedor = useRef<HTMLDivElement>(null);

  // La columna identificadora va primero y queda fija al desplazarse en horizontal.
  const cols = useMemo(() => (tabla ? [...tabla.columnas].sort((a, b) => Number(b.rol === "id") - Number(a.rol === "id")) : []), [tabla]);
  const fija = cols[0]?.rol === "id" ? cols[0].nombre : null;

  const maximos = useMemo(() => {
    const m: Record<string, number> = {};
    tabla?.medidas.forEach((c) => (m[c] = Math.max(0, ...filas.map((f) => Math.abs((f[c] as number) ?? 0)))));
    return m;
  }, [tabla, filas]);

  const columnas = useMemo<ColumnDef<Funciones, Fila>[]>(
    () =>
      cols.map((c) => ({
        id: c.nombre,
        accessorFn: (f: Fila) => f[c.nombre],
        header: c.nombre,
        sortFn: ordenar,
        filterFn: contiene,
        sortDescFirst: c.rol === "medida",
        meta: { rol: c.rol },
        cell: ({ getValue }) => {
          const v = getValue() as Valor;
          if (c.tonos && v !== null) return <Estado tono={c.tonos[texto(v)] ?? "neutro"} texto={texto(v)} />;
          if (c.rol === "medida" && typeof v === "number") {
            const ancho = maximos[c.nombre] ? (Math.abs(v) / maximos[c.nombre]) * 100 : 0;
            return (
              <div className="relative ml-auto flex min-w-[88px] justify-end">
                <span className="absolute inset-y-0.5 right-0 rounded-sm bg-accent-soft" style={{ width: `${ancho}%` }} aria-hidden />
                <span className="num relative text-ink">{formato(v)}</span>
              </div>
            );
          }
          return texto(v);
        },
      })),
    [cols, maximos],
  );

  const table = useTable({
    features: FUNCIONES,
    columns: columnas,
    data: filas,
    state: { sorting: orden, columnFilters: filtrosCol, globalFilter: busqueda },
    onSortingChange: setOrden,
    onColumnFiltersChange: setFiltrosCol,
    onGlobalFilterChange: setBusqueda,
    globalFilterFn: contiene,
    getColumnCanGlobalFilter: () => true,
  });
  const visibles = table.getRowModel().rows;

  // eslint-disable-next-line react-hooks/incompatible-library -- el virtualizador se lee en cada render a propósito
  const virtual = useVirtualizer({
    count: visibles.length,
    getScrollElement: () => contenedor.current,
    estimateSize: () => ALTO_FILA,
    overscan: 12,
  });
  // Al cambiar búsqueda, filtros u orden se vuelve al inicio de la tabla.
  useEffect(() => {
    contenedor.current?.scrollTo({ top: 0 });
  }, [busqueda, filtrosCol, orden, filas]);
  const items = virtual.getVirtualItems();
  const arriba = items[0]?.start ?? 0;
  const abajo = virtual.getTotalSize() - (items.at(-1)?.end ?? 0);

  if (!tabla) return null;
  const filtrosActivos = filtrosCol.length + (busqueda ? 1 : 0);

  const descargar = () => {
    const blob = new Blob([aCSV(visibles.map((r) => r.original), cols.map((c) => c.nombre))], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(meta?.nombre ?? "datos").replace(/\.xlsx?$/i, "")}_filtrado.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("CSV descargado", { description: `${formato(visibles.length)} registros con el orden y los filtros actuales.` });
  };

  const fondoFija = "bg-card group-hover/fila:bg-surface-hover";
  return (
    <Panel
      titulo={`${formato(visibles.length)} registros`}
      subtitulo="Busca en todas las columnas, filtra cada una y haz clic en un encabezado para ordenar"
      acciones={
        <>
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar…" aria-label="Buscar en la tabla" className="bg-card pl-8" />
          </div>
          {filtrosActivos > 0 && (
            <Button variant="ghost" onClick={() => { setBusqueda(""); setFiltrosCol([]); }} className="text-muted-foreground">
              <X aria-hidden /> Limpiar
            </Button>
          )}
          <Button variant="outline" className="bg-card" onClick={descargar}>
            <Download aria-hidden /> CSV
          </Button>
        </>
      }
    >
      <div
        ref={contenedor}
        className="-mx-[var(--pad)] max-h-[min(70vh,640px)] overflow-auto border-y border-line"
        role="region"
        aria-label="Tabla de registros"
        tabIndex={0}
      >
        <table className="w-full min-w-max border-separate border-spacing-0 text-[13px]" aria-rowcount={visibles.length + 2}>
          <thead className="sticky top-0 z-20">
            {table.getHeaderGroups().map((grupo) => (
              <tr key={grupo.id}>
                {grupo.headers.map((h) => {
                  const rol = h.column.columnDef.meta?.rol;
                  const dir = h.column.getIsSorted();
                  const Flecha = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}
                      className={cn(
                        "border-b border-line bg-muted px-3 pt-2 pb-1 font-medium whitespace-nowrap text-muted-foreground",
                        rol === "medida" ? "text-right" : "text-left",
                        h.column.id === fija && "sticky left-0 z-10 border-r",
                      )}
                    >
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        className={cn("group/orden inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring", dir && "text-foreground")}
                      >
                        {String(h.column.columnDef.header)}
                        <Flecha size={12} className={cn(!dir && "opacity-0 group-hover/orden:opacity-60 group-focus-visible/orden:opacity-60")} aria-hidden />
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
            <tr>
              {table.getHeaderGroups()[0]?.headers.map((h) => (
                <th key={h.id} className={cn("border-b border-line bg-muted px-2 pb-2 font-normal", h.column.id === fija && "sticky left-0 z-10 border-r")}>
                  <input
                    value={(h.column.getFilterValue() as string) ?? ""}
                    onChange={(e) => h.column.setFilterValue(e.target.value || undefined)}
                    placeholder="Filtrar…"
                    aria-label={`Filtrar ${h.column.id}`}
                    className={cn(
                      "h-7 w-full min-w-[72px] rounded-md border border-line bg-card px-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
                      h.column.columnDef.meta?.rol === "medida" && "text-right",
                    )}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {arriba > 0 && <tr aria-hidden><td colSpan={cols.length} style={{ height: arriba, padding: 0 }} /></tr>}
            {items.map((item) => {
              const fila = visibles[item.index];
              return (
                <tr key={fila.id} className="group/fila" style={{ height: ALTO_FILA }} aria-rowindex={item.index + 3}>
                  {fila.getAllCells().map((celda) => {
                    const rol = celda.column.columnDef.meta?.rol;
                    return (
                      <td
                        key={celda.id}
                        className={cn(
                          "border-b border-line px-3 whitespace-nowrap group-hover/fila:bg-surface-hover",
                          rol === "medida" ? "text-right" : rol === "id" ? "num text-muted-foreground" : "text-ink-2",
                          celda.column.id === fija && cn("sticky left-0 z-[1] border-r", fondoFija),
                        )}
                      >
                        <table.FlexRender cell={celda} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {abajo > 0 && <tr aria-hidden><td colSpan={cols.length} style={{ height: abajo, padding: 0 }} /></tr>}
          </tbody>
        </table>
        {visibles.length === 0 && <p className="p-8 text-center text-[13px] text-muted-foreground">Ningún registro coincide con la búsqueda.</p>}
      </div>
      <p className="mt-3 text-[12px] text-muted-foreground">
        {orden.length > 0 ? `Ordenado por ${orden[0].id} (${orden[0].desc ? "mayor a menor" : "menor a mayor"})` : "Sin orden aplicado"}
        {" · "}desplázate para ver más filas
      </p>
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
