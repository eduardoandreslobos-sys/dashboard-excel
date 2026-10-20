"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Layers } from "lucide-react";
import { useDash, useFilasExcepto } from "../Contexto";
import { Estado, Panel, Segmentado, Selector } from "../ui";
import { BarrasCategoria, nombreMedida } from "./Resumen";
import { agregacionDe, columna, type Fila, type Tabla } from "@/lib/analisis";
import { correlacion, formato, porCategoria, texto, valorDe } from "@/lib/calculo";
import {
  BarrasRanking,
  colorPorEntidad,
  COLOR_ESTADO,
  Dispersion as GraficoDispersion,
  Histograma as GraficoHistograma,
  MapaCalor,
  PuntosVsPromedio,
  Treemap,
  useAnimar,
  type Celda,
} from "../charts";

const esMedia = (tabla: Tabla, m: string | null) => !!m && agregacionDe(tabla, m) === "mean";

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
        <p className="text-[13px] text-ink-3">Haz clic en cualquier barra o tesela para filtrar todo el dashboard por ese valor.</p>
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
      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: "var(--gap)" }}>
        {tabla.categorias
          .filter((c) => !enJerarquia.has(c))
          .map((c) => (
            <Panel key={c} titulo={`${nombreMedida(tabla, m)} por ${c}`} subtitulo={`${columna(tabla, c).unicos} valores${columna(tabla, c).unicos > 15 ? " · se muestran los 15 mayores" : ""}`}>
              <BarrasCategoria tabla={tabla} filas={filas} cat={c} medida={m} />
            </Panel>
          ))}
      </div>
    </div>
  );
}

function DrillDown({ tabla, filas, padre, hijo, medida }: { tabla: Tabla; filas: Fila[]; padre: string; hijo: string; medida: string | null }) {
  const { alternarFiltro, filtros } = useDash();
  const animar = useAnimar();
  const media = esMedia(tabla, medida);
  const [ruta, setRuta] = useState<string | null>(null);
  const [forma, setForma] = useState<"treemap" | "barras">(media ? "barras" : "treemap");
  const nivel = ruta ? hijo : padre;
  const baseNivel = useFilasExcepto(nivel);
  const fuente = filtros.categorias[nivel]?.length ? baseNivel : filas;
  const sub = useMemo(() => (ruta ? fuente.filter((f) => texto(f[padre]) === ruta) : fuente), [fuente, ruta, padre]);
  const barras = useMemo(() => porCategoria(tabla, sub, nivel, medida).slice(0, 20), [tabla, sub, nivel, medida]);
  const colorPadre = useMemo(() => colorPorEntidad(tabla, padre), [tabla, padre]);
  // En el nivel hijo, todas las teselas heredan el color de su padre (identidad, no ranking).
  const colorDe = ruta ? () => colorPadre(ruta) : colorPadre;
  const clic = (v: string) => (!ruta ? setRuta(v) : alternarFiltro(hijo, v));
  const verTreemap = forma === "treemap" && !media;

  return (
    <Panel
      titulo={
        <span className="inline-flex items-center gap-1.5">
          <Layers size={15} className="text-accent" aria-hidden /> Drill-down {padre} → {hijo}
        </span>
      }
      subtitulo={ruta ? `Clic en un valor de ${hijo} para filtrar el dashboard` : `Clic en un valor de ${padre} para ver sus ${plural(hijo)}`}
      acciones={
        !media && (
          <Segmentado
            etiqueta="Forma"
            valor={forma}
            onChange={setForma}
            opciones={[
              { valor: "treemap", texto: "Treemap" },
              { valor: "barras", texto: "Barras" },
            ]}
          />
        )
      }
    >
      <nav aria-label="Ruta" className="mb-3 flex flex-wrap items-center gap-1 text-[13px]">
        <button type="button" onClick={() => setRuta(null)} className={ruta ? "text-accent hover:underline" : "font-semibold text-ink"}>
          Todo: {plural(padre)}
        </button>
        {ruta && (
          <>
            <ChevronRight size={14} className="text-ink-3" aria-hidden />
            <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: colorPadre(ruta) }} aria-hidden />
              {ruta}
            </span>
            <span className="text-ink-3">· {formato(sub.length)} registros · {formato(valorDe(tabla, sub, medida))}</span>
          </>
        )}
      </nav>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${nivel}-${ruta ?? ""}-${forma}`}
          initial={animar ? { opacity: 0, scale: 0.98 } : false}
          animate={{ opacity: 1, scale: 1 }}
          exit={animar ? { opacity: 0, scale: 0.98 } : undefined}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          {verTreemap ? (
            <Treemap
              barras={barras}
              nombre={nombreMedida(tabla, medida)}
              etiqueta={`Treemap por ${nivel}`}
              colorDe={colorDe}
              seleccionados={ruta ? filtros.categorias[hijo] : undefined}
              onSeleccionar={clic}
              pista={ruta ? "Clic para filtrar el dashboard" : `Clic para ver sus ${plural(hijo)}`}
              alto={360}
            />
          ) : (
            <BarrasRanking
              barras={barras}
              nombre={nombreMedida(tabla, medida)}
              etiqueta={`Drill-down por ${nivel}`}
              colorDe={colorDe}
              seleccionados={filtros.categorias[nivel]}
              onSeleccionar={clic}
              sumable={!media}
            />
          )}
        </motion.div>
      </AnimatePresence>
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
              <p className="text-[13px] text-ink-3">Cada punto es el promedio del segmento; la línea punteada es el promedio general.</p>
            </div>
            <Selector etiqueta="Comparar por" valor={grupo} opciones={cats.map((c) => ({ valor: c, texto: c }))} onChange={setCat} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: "var(--gap)" }}>
            {promedios.map((m) => (
              <Panel key={m} titulo={`${m} por ${grupo}`}>
                <Puntos tabla={tabla} filas={filas} medida={m} cat={grupo} />
              </Panel>
            ))}
          </div>
        </>
      )}
      {continuas.length > 0 && (
        <>
          <div>
            <h2 className="text-[16px] font-semibold text-ink">Distribución de valores</h2>
            <p className="text-[13px] text-ink-3">Cuántos registros caen en cada rango. La línea punteada es el promedio.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3" style={{ gap: "var(--gap)" }}>
            {continuas.map((m) => (
              <Panel key={m} titulo={m}>
                <Histograma filas={filas} medida={m} />
              </Panel>
            ))}
          </div>
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
  return (
    <PuntosVsPromedio
      barras={barras}
      promedio={general}
      nombre={medida}
      etiqueta={`${medida} por ${cat}`}
      seleccionados={filtros.categorias[cat]}
      onSeleccionar={(v) => alternarFiltro(cat, v)}
    />
  );
}

function Histograma({ filas, medida }: { filas: Fila[]; medida: string }) {
  const valores = useMemo(() => filas.map((f) => f[medida]).filter((v): v is number => typeof v === "number"), [filas, medida]);
  return <GraficoHistograma valores={valores} nombre={medida} />;
}

function Riesgo({ tabla, filas, cats }: { tabla: Tabla; filas: Fila[]; cats: string[] }) {
  const estado = tabla.estado!;
  const { filtros, alternarFiltro } = useDash();
  const tonos = useMemo(() => columna(tabla, estado).tonos ?? {}, [tabla, estado]);
  const riesgo = useMemo(() => Object.entries(tonos).filter(([, t]) => t === "critico" || t === "serio").map(([v]) => v), [tonos]);
  const [cat, setCat] = useState(cats[0]);
  const grupo = cats.includes(cat) ? cat : cats[0];
  const base = useFilasExcepto(grupo ?? "");
  const fuente = grupo && filtros.categorias[grupo]?.length ? base : filas;
  const barras = useMemo(
    () =>
      grupo
        ? porCategoria(tabla, fuente, grupo, null)
            .map((b) => {
              const sub = fuente.filter((f) => texto(f[grupo]) === b.etiqueta);
              return { etiqueta: b.etiqueta, valor: (sub.filter((f) => riesgo.includes(texto(f[estado]))).length / sub.length) * 100, n: sub.length };
            })
            .sort((a, b) => b.valor - a.valor)
            .slice(0, 15)
        : [],
    [tabla, fuente, grupo, riesgo, estado],
  );
  const general = fuente.length ? (fuente.filter((f) => riesgo.includes(texto(f[estado]))).length / fuente.length) * 100 : 0;
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
      <PuntosVsPromedio
        barras={barras}
        promedio={general}
        nombre={`% en ${riesgo.join(" / ").toLowerCase()}`}
        etiqueta={`Riesgo por ${grupo}`}
        subirEsMalo
        unidad=" %"
        seleccionados={filtros.categorias[grupo]}
        onSeleccionar={(v) => alternarFiltro(grupo, v)}
      />
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
  const celdas = useMemo<Celda[]>(() => matriz.flatMap((fila, i) => fila.map((v, j) => ({ x: j, y: i, valor: v }))), [matriz]);
  const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(2).replace(".", ",").replace("-", "−") : "—");
  return <MapaCalor xs={medidas} ys={medidas} celdas={celdas} tipo="divergente" nombre="Correlación" etiqueta="Matriz de correlación" formatoValor={fmt} />;
}

function Dispersion({ tabla, filas, x, y }: { tabla: Tabla; filas: Fila[]; x: string; y: string }) {
  const color = tabla.estado ?? tabla.categorias.find((c) => columna(tabla, c).unicos <= 3);
  const series = useMemo(() => {
    const tonos = color ? columna(tabla, color).tonos : undefined;
    // Con columna de estado se agrupa por tono (al día / en riesgo…), así ningún color se repite.
    const claveDe = (f: Fila) => (color ? (tonos ? tonos[texto(f[color])] ?? "neutro" : texto(f[color])) : "Registros");
    const grupos = new Map<string, [number, number][]>();
    for (const f of filas) {
      const k = claveDe(f);
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push([f[x] as number, f[y] as number]);
    }
    const colorCat = color && !tonos ? colorPorEntidad(tabla, color) : undefined;
    const nombreDe = (k: string) => (tonos ? Object.entries(tonos).filter(([, tono]) => tono === k).map(([v]) => v).join(" / ") : k);
    return [...grupos].map(([k, puntos]) => ({
      nombre: nombreDe(k),
      color: tonos ? COLOR_ESTADO[k as keyof typeof COLOR_ESTADO] : colorCat ? colorCat(k) : "var(--s1)",
      puntos,
    }));
  }, [filas, x, y, color, tabla]);
  return <GraficoDispersion series={series} x={x} y={y} etiqueta={`${y} versus ${x}`} />;
}

function Cruce({ tabla, filas, cats }: { tabla: Tabla; filas: Fila[]; cats: string[] }) {
  const [filaElegida, setFila] = useState(cats[1] ?? cats[0]);
  const [col, setCol] = useState(cats[0]);
  const [medida, setMedida] = useState<string>("__registros");
  // Al cambiar de tabla, lo elegido puede no existir: se vuelve a los valores por defecto.
  const fila = cats.includes(filaElegida) ? filaElegida : (cats[1] ?? cats[0]);
  const m = medida === "__registros" || !tabla.medidas.includes(medida) ? null : medida;
  const columnaX = col !== fila && cats.includes(col) ? col : cats.find((c) => c !== fila)!;
  const datos = useMemo(() => {
    const ys = porCategoria(tabla, filas, fila, null).map((b) => b.etiqueta);
    const xs = porCategoria(tabla, filas, columnaX, null).map((b) => b.etiqueta);
    const iy = new Map(ys.map((v, i) => [v, i]));
    const ix = new Map(xs.map((v, i) => [v, i]));
    const grupos = new Map<string, Fila[]>();
    for (const f of filas) {
      const k = `${iy.get(texto(f[fila]))}|${ix.get(texto(f[columnaX]))}`;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(f);
    }
    const celdas: Celda[] = [...grupos].map(([k, sub]) => {
      const [i, j] = k.split("|").map(Number);
      return { x: j, y: i, valor: valorDe(tabla, sub, m), n: sub.length };
    });
    return { xs, ys, celdas };
  }, [tabla, filas, fila, columnaX, m]);
  return (
    <Panel
      titulo="Cruce entre dos categorías"
      subtitulo={`${nombreMedida(tabla, m)} para cada combinación · color más intenso = mayor`}
      acciones={
        <>
          <Selector etiqueta="Filas" valor={fila} opciones={cats.map((c) => ({ valor: c, texto: c }))} onChange={setFila} />
          <Selector etiqueta="Columnas" valor={columnaX} opciones={cats.filter((c) => c !== fila).map((c) => ({ valor: c, texto: c }))} onChange={setCol} />
          <Selector
            etiqueta="Valor"
            valor={m ?? "__registros"}
            opciones={[{ valor: "__registros", texto: "Registros" }, ...tabla.medidas.map((x) => ({ valor: x, texto: nombreMedida(tabla, x) }))]}
            onChange={setMedida}
          />
        </>
      }
    >
      <MapaCalor
        xs={datos.xs}
        ys={datos.ys}
        celdas={datos.celdas}
        tipo="secuencial"
        nombre={nombreMedida(tabla, m)}
        etiqueta="Cruce entre categorías"
        sumable={!esMedia(tabla, m)}
      />
    </Panel>
  );
}
