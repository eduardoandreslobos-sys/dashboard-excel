"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronRight, Layers } from "lucide-react";
import Grafico, { type Tokens } from "../Grafico";
import { useDash, useFilasExcepto } from "../Contexto";
import { Estado, Grilla, Panel, Segmentado, Selector } from "../ui";
import { BarrasCategoria, nombreMedida } from "./Resumen";
import { agregacionDe, columna, type Fila, type Tabla } from "@/lib/analisis";
import { correlacion, formato, histograma, porCategoria, texto, valorDe } from "@/lib/calculo";
import { barrasH, dispersion, histograma as optHistograma, mapaCalor, puntosVsPromedio } from "@/lib/opciones";

// ---------------------------------------------------------------- Segmentos

/** Plural simple en español: región → regiones, sucursal → sucursales, comuna → comunas. */
const plural = (s: string) => {
  const p = s.toLowerCase();
  if (/ón$/.test(p)) return p.replace(/ón$/, "ones");
  if (/[aeiouáéó]$/.test(p)) return p + "s";
  if (/z$/.test(p)) return p.replace(/z$/, "ces");
  return p + "es";
};

export function Segmentos() {
  const { tabla, filas, medida } = useDash();
  const [modo, setModo] = useState<"medida" | "conteo">("medida");
  if (!tabla) return null;
  const m = modo === "conteo" ? null : medida;
  const enJerarquia = new Set(tabla.jerarquias.flatMap((j) => [j.hijo]));
  return (
    <div className="flex flex-col" style={{ gap: "var(--gap)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-3">Haz clic en cualquier barra para filtrar todo el dashboard por ese valor.</p>
        {medida && (
          <Segmentado
            etiqueta="Valor"
            valor={modo}
            onChange={setModo}
            opciones={[
              { valor: "medida", texto: nombreMedida(tabla, medida) },
              { valor: "conteo", texto: "Registros" },
            ]}
          />
        )}
      </div>
      {tabla.jerarquias.map((j) => (
        <DrillDown key={j.hijo} tabla={tabla} filas={filas} padre={j.padre} hijo={j.hijo} medida={m} />
      ))}
      <Grilla columnas={2}>
        {tabla.categorias
          .filter((c) => !enJerarquia.has(c))
          .map((c) => (
            <Panel key={c} titulo={`${nombreMedida(tabla, m)} por ${c}`} subtitulo={`${columna(tabla, c).unicos} valores${columna(tabla, c).unicos > 15 ? " · se muestran los 15 mayores" : ""}`}>
              <BarrasCategoria tabla={tabla} filas={filas} cat={c} medida={m} />
            </Panel>
          ))}
      </Grilla>
    </div>
  );
}

function DrillDown({ tabla, filas, padre, hijo, medida }: { tabla: Tabla; filas: Fila[]; padre: string; hijo: string; medida: string | null }) {
  const { alternarFiltro, filtros } = useDash();
  const [ruta, setRuta] = useState<string | null>(null);
  const nivel = ruta ? hijo : padre;
  const baseNivel = useFilasExcepto(nivel);
  const fuente = filtros.categorias[nivel]?.length ? baseNivel : filas;
  const sub = useMemo(() => (ruta ? fuente.filter((f) => texto(f[padre]) === ruta) : fuente), [fuente, ruta, padre]);
  const barras = useMemo(() => porCategoria(tabla, sub, nivel, medida).slice(0, 20), [tabla, sub, nivel, medida]);
  const opcion = useCallback(
    (t: Tokens) => barrasH(t, barras, { nombre: nombreMedida(tabla, medida), seleccionados: filtros.categorias[nivel], total: medida && agregacionDe(tabla, medida) === "mean" ? 0 : undefined }),
    [barras, tabla, medida, filtros, nivel],
  );
  const clic = useCallback(
    (e: { name?: string }) => {
      if (!e.name) return;
      if (!ruta) setRuta(e.name);
      else alternarFiltro(hijo, e.name);
    },
    [ruta, alternarFiltro, hijo],
  );
  return (
    <Panel
      titulo={
        <span className="inline-flex items-center gap-1.5">
          <Layers size={15} className="text-accent" aria-hidden /> Drill-down {padre} → {hijo}
        </span>
      }
      subtitulo={ruta ? `Clic en un valor de ${hijo} para filtrar el dashboard` : `Clic en un valor de ${padre} para ver sus ${plural(hijo)}`}
    >
      <nav aria-label="Ruta" className="mb-3 flex flex-wrap items-center gap-1 text-[13px]">
        <button type="button" onClick={() => setRuta(null)} className={ruta ? "text-accent hover:underline" : "font-semibold text-ink"}>
          Todo: {plural(padre)}
        </button>
        {ruta && (
          <>
            <ChevronRight size={14} className="text-ink-3" aria-hidden />
            <span className="font-semibold text-ink">{ruta}</span>
            <span className="text-ink-3">· {formato(sub.length)} registros · {formato(valorDe(tabla, sub, medida))}</span>
          </>
        )}
      </nav>
      <Grafico key={nivel} opcion={opcion} onClick={clic} alto={Math.max(160, barras.length * 30 + 20)} etiqueta={`Drill-down por ${nivel}`} />
    </Panel>
  );
}

// ---------------------------------------------------------------- Distribución y riesgo

export function Distribucion() {
  const { tabla, filas } = useDash();
  const promedios = tabla ? tabla.medidas.filter((m) => agregacionDe(tabla, m) === "mean") : [];
  const cats = tabla ? tabla.categorias.filter((c) => { const n = columna(tabla, c).unicos; return n >= 2 && n <= 20; }) : [];
  const [cat, setCat] = useState<string | null>(null);
  if (!tabla) return null;
  const grupo = cat && cats.includes(cat) ? cat : cats.find((c) => c !== tabla.estado) ?? cats[0];
  const continuas = tabla.medidas.filter((m) => !columna(tabla, m).discreta);
  return (
    <div className="flex flex-col" style={{ gap: "var(--gap)" }}>
      {tabla.estado && grupo && <Riesgo tabla={tabla} filas={filas} cats={cats.filter((c) => c !== tabla.estado)} />}
      {promedios.length > 0 && grupo && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold text-ink">Promedios por segmento</h2>
              <p className="text-[13px] text-ink-3">Cada punto es el promedio del segmento; la línea es el promedio general. Azul = sobre el promedio.</p>
            </div>
            <Selector etiqueta="Comparar por" valor={grupo} opciones={cats.map((c) => ({ valor: c, texto: c }))} onChange={setCat} />
          </div>
          <Grilla columnas={2}>
            {promedios.map((m) => (
              <Panel key={m} titulo={`${m} por ${grupo}`}>
                <Puntos tabla={tabla} filas={filas} medida={m} cat={grupo} />
              </Panel>
            ))}
          </Grilla>
        </>
      )}
      {continuas.length > 0 && (
        <>
          <div>
            <h2 className="text-[16px] font-semibold text-ink">Distribución de valores</h2>
            <p className="text-[13px] text-ink-3">Cuántos registros caen en cada rango. La línea punteada es el promedio.</p>
          </div>
          <Grilla columnas={3}>
            {continuas.map((m) => (
              <Panel key={m} titulo={m}>
                <Histograma filas={filas} medida={m} />
              </Panel>
            ))}
          </Grilla>
        </>
      )}
    </div>
  );
}

function Puntos({ tabla, filas, medida, cat }: { tabla: Tabla; filas: Fila[]; medida: string; cat: string }) {
  const { filtros, alternarFiltro } = useDash();
  const base = useFilasExcepto(cat);
  const fuente = filtros.categorias[cat]?.length ? base : filas;
  const barras = useMemo(() => porCategoria(tabla, fuente, cat, medida).slice(0, 20), [tabla, fuente, cat, medida]);
  const general = useMemo(() => valorDe(tabla, fuente, medida), [tabla, fuente, medida]);
  const opcion = useCallback((t: Tokens) => puntosVsPromedio(t, barras, general, medida, filtros.categorias[cat]), [barras, general, medida, filtros, cat]);
  const clic = useCallback((e: { dataIndex?: number }) => {
    const b = [...barras].reverse()[e.dataIndex ?? -1];
    if (b) alternarFiltro(cat, b.etiqueta);
  }, [barras, alternarFiltro, cat]);
  return <Grafico opcion={opcion} onClick={clic} alto={Math.max(160, barras.length * 32 + 40)} etiqueta={`${medida} por ${cat}`} />;
}

function Histograma({ filas, medida }: { filas: Fila[]; medida: string }) {
  const valores = useMemo(() => filas.map((f) => f[medida]).filter((v): v is number => typeof v === "number"), [filas, medida]);
  const cubetas = useMemo(() => histograma(valores), [valores]);
  const prom = valores.reduce((a, b) => a + b, 0) / (valores.length || 1);
  const opcion = useCallback((t: Tokens) => optHistograma(t, cubetas, prom, medida), [cubetas, prom, medida]);
  return <Grafico opcion={opcion} alto={220} etiqueta={`Distribución de ${medida}`} />;
}

function Riesgo({ tabla, filas, cats }: { tabla: Tabla; filas: Fila[]; cats: string[] }) {
  const estado = tabla.estado!;
  const tonos = useMemo(() => columna(tabla, estado).tonos ?? {}, [tabla, estado]);
  const riesgo = useMemo(() => Object.entries(tonos).filter(([, t]) => t === "critico" || t === "serio").map(([v]) => v), [tonos]);
  const [cat, setCat] = useState(cats[0]);
  const grupo = cats.includes(cat) ? cat : cats[0];
  const barras = useMemo(
    () =>
      grupo
        ? porCategoria(tabla, filas, grupo, null)
            .map((b) => {
              const sub = filas.filter((f) => texto(f[grupo]) === b.etiqueta);
              return { etiqueta: b.etiqueta, valor: (sub.filter((f) => riesgo.includes(texto(f[estado]))).length / sub.length) * 100, n: sub.length };
            })
            .sort((a, b) => b.valor - a.valor)
            .slice(0, 15)
        : [],
    [tabla, filas, grupo, riesgo, estado],
  );
  const general = filas.length ? (filas.filter((f) => riesgo.includes(texto(f[estado]))).length / filas.length) * 100 : 0;
  const { alternarFiltro } = useDash();
  const opcion = useCallback((t: Tokens) => puntosVsPromedio(t, barras, general, `% en ${riesgo.join(" / ").toLowerCase()}`), [barras, general, riesgo]);
  const clic = useCallback((e: { dataIndex?: number }) => {
    const b = [...barras].reverse()[e.dataIndex ?? -1];
    if (b && grupo) alternarFiltro(grupo, b.etiqueta);
  }, [barras, alternarFiltro, grupo]);
  if (!riesgo.length || !grupo) return null;
  return (
    <Panel
      titulo={`Riesgo por ${grupo}`}
      subtitulo={
        <span className="inline-flex flex-wrap items-center gap-1">
          % de registros en {riesgo.map((r) => <Estado key={r} tono={tonos[r]} texto={r} />)} · general {formato(general)} %
        </span>
      }
      acciones={<Selector etiqueta="Por" valor={grupo} opciones={cats.map((c) => ({ valor: c, texto: c }))} onChange={setCat} />}
    >
      <Grafico opcion={opcion} onClick={clic} alto={Math.max(180, barras.length * 32 + 40)} etiqueta={`Riesgo por ${grupo}`} />
    </Panel>
  );
}

// ---------------------------------------------------------------- Relaciones

export function Relaciones() {
  const { tabla, filas } = useDash();
  const medidas = useMemo(() => (tabla ? tabla.medidas.filter((m) => new Set(filas.map((f) => f[m])).size > 1) : []), [tabla, filas]);
  const matriz = useMemo(
    () => medidas.map((a) => medidas.map((b) => correlacion(filas.map((f) => f[a] as number), filas.map((f) => f[b] as number)))),
    [medidas, filas],
  );
  const mejor = useMemo(() => {
    let r: [number, number, number] = [0, 0, 1];
    matriz.forEach((fila, i) => fila.forEach((v, j) => { if (j > i && Math.abs(v) < 0.995 && Math.abs(v) > Math.abs(r[0])) r = [v, i, j]; }));
    return r;
  }, [matriz]);
  const [x, setX] = useState<string | null>(null);
  const [y, setY] = useState<string | null>(null);
  if (!tabla) return null;
  const ejeX = x && medidas.includes(x) ? x : medidas[mejor[1]];
  const ejeY = y && medidas.includes(y) ? y : medidas[mejor[2]];
  const cats = tabla.categorias.filter((c) => { const n = columna(tabla, c).unicos; return n >= 2 && n <= 20; });
  return (
    <div className="flex flex-col" style={{ gap: "var(--gap)" }}>
      {medidas.length >= 2 && (
        <div className="grid grid-cols-1 xl:grid-cols-2" style={{ gap: "var(--gap)" }}>
          {medidas.length >= 3 && (
            <Panel titulo="Correlación entre medidas" subtitulo="Azul: suben juntas · Rojo: una sube y la otra baja · 0 = sin relación">
              <MatrizCorrelacion medidas={medidas} matriz={matriz} />
            </Panel>
          )}
          <Panel
            titulo={`${ejeY} vs ${ejeX}`}
            subtitulo="Cada punto es un registro"
            acciones={
              <>
                <Selector etiqueta="X" valor={ejeX} opciones={medidas.map((m) => ({ valor: m, texto: m }))} onChange={setX} />
                <Selector etiqueta="Y" valor={ejeY} opciones={medidas.map((m) => ({ valor: m, texto: m }))} onChange={setY} />
              </>
            }
          >
            <Dispersion tabla={tabla} filas={filas} x={ejeX} y={ejeY} />
          </Panel>
        </div>
      )}
      {cats.length >= 2 && <Cruce tabla={tabla} filas={filas} cats={cats} />}
    </div>
  );
}

function MatrizCorrelacion({ medidas, matriz }: { medidas: string[]; matriz: number[][] }) {
  const opcion = useCallback(
    (t: Tokens) => mapaCalor(t, medidas, medidas, matriz.flatMap((fila, i) => fila.map((v, j) => [j, i, Number(v.toFixed(2))] as [number, number, number])), { divergente: true, nombre: "Correlación", decimales: true }),
    [medidas, matriz],
  );
  return <Grafico opcion={opcion} alto={Math.max(300, medidas.length * 40 + 60)} etiqueta="Matriz de correlación" />;
}

function Dispersion({ tabla, filas, x, y }: { tabla: Tabla; filas: Fila[]; x: string; y: string }) {
  const color = tabla.estado ?? tabla.categorias.find((c) => columna(tabla, c).unicos <= 3);
  const opcion = useCallback(
    (t: Tokens) => {
      const muestra = filas.length > 3000 ? filas.filter((_, i) => i % Math.ceil(filas.length / 3000) === 0) : filas;
      const tonos = color ? columna(tabla, color).tonos : undefined;
      const porTono = { bueno: t.ok, alerta: t.warn, serio: t.serious, critico: t.critical, neutro: t.neutral };
      // Con columna de estado se agrupa por tono (al día / en riesgo…), así ningún color se repite.
      const claveDe = (f: Fila) => (color ? (tonos ? tonos[texto(f[color])] ?? "neutro" : texto(f[color])) : "Registros");
      const claves = [...new Set(muestra.map(claveDe))];
      const nombreDe = (k: string) =>
        tonos ? Object.entries(tonos).filter(([, tono]) => tono === k).map(([v]) => v).join(" / ") : k;
      return dispersion(
        t,
        claves.map((k, i) => ({
          nombre: nombreDe(k),
          color: tonos ? porTono[k as keyof typeof porTono] : t.series[i % 3],
          puntos: muestra.filter((f) => claveDe(f) === k).map((f) => [f[x] as number, f[y] as number]),
        })),
        { x, y },
      );
    },
    [filas, x, y, color, tabla],
  );
  return <Grafico opcion={opcion} alto={360} etiqueta={`${y} versus ${x}`} />;
}

function Cruce({ tabla, filas, cats }: { tabla: Tabla; filas: Fila[]; cats: string[] }) {
  const [fila, setFila] = useState(cats[1] ?? cats[0]);
  const [col, setCol] = useState(cats[0]);
  const [medida, setMedida] = useState<string>("__registros");
  const m = medida === "__registros" ? null : medida;
  const columnaX = col !== fila ? col : cats.find((c) => c !== fila)!;
  const datos = useMemo(() => {
    const ys = porCategoria(tabla, filas, fila, null).map((b) => b.etiqueta);
    const xs = porCategoria(tabla, filas, columnaX, null).map((b) => b.etiqueta);
    const celdas: [number, number, number][] = [];
    ys.forEach((yv, i) =>
      xs.forEach((xv, j) => {
        const sub = filas.filter((f) => texto(f[fila]) === yv && texto(f[columnaX]) === xv);
        if (sub.length) celdas.push([j, i, valorDe(tabla, sub, m)]);
      }),
    );
    return { xs, ys, celdas };
  }, [tabla, filas, fila, columnaX, m]);
  const opcion = useCallback(
    (t: Tokens) => mapaCalor(t, datos.xs, datos.ys, datos.celdas, { nombre: nombreMedida(tabla, m), decimales: !!m && agregacionDe(tabla, m) === "mean" }),
    [datos, tabla, m],
  );
  return (
    <Panel
      titulo="Cruce entre dos categorías"
      subtitulo={`${nombreMedida(tabla, m)} para cada combinación`}
      acciones={
        <>
          <Selector etiqueta="Filas" valor={fila} opciones={cats.map((c) => ({ valor: c, texto: c }))} onChange={setFila} />
          <Selector etiqueta="Columnas" valor={columnaX} opciones={cats.filter((c) => c !== fila).map((c) => ({ valor: c, texto: c }))} onChange={setCol} />
          <Selector
            etiqueta="Valor"
            valor={medida}
            opciones={[{ valor: "__registros", texto: "Registros" }, ...tabla.medidas.map((x) => ({ valor: x, texto: nombreMedida(tabla, x) }))]}
            onChange={setMedida}
          />
        </>
      }
    >
      <Grafico opcion={opcion} alto={Math.max(260, datos.ys.length * 38 + 60)} etiqueta="Cruce entre categorías" />
    </Panel>
  );
}
