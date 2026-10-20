"use client";

import { useMemo, useState } from "react";
import { useDash } from "../Contexto";
import { Panel, Segmentado, Selector } from "../ui";
import { agregacionDe, columna } from "@/lib/analisis";
import { PERIODOS, porCategoria, serieTemporal, type Calculo, type Periodo } from "@/lib/calculo";
import { ApiladoComposicion, AreaTendencia, BarrasRanking, colorPorEntidad, Treemap } from "../charts";

const CALCULOS: { valor: Calculo; texto: string }[] = [
  { valor: "sum", texto: "Suma" },
  { valor: "mean", texto: "Promedio" },
  { valor: "median", texto: "Mediana" },
  { valor: "max", texto: "Máximo" },
  { valor: "min", texto: "Mínimo" },
];

type Forma = "barras" | "treemap" | "area" | "columnas";

/** "Arma tu propio gráfico": agrupar por cualquier dimensión, medir y calcular a elección. */
export function Explorador() {
  const { tabla, filas, alternarFiltro, filtros } = useDash();
  const dims = tabla ? [...tabla.categorias, ...tabla.fechas] : [];
  const [dim, setDim] = useState(dims[0] ?? "");
  const [medida, setMedida] = useState("__registros");
  const [calculo, setCalculo] = useState<Calculo | "auto">("auto");
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [forma, setForma] = useState<Forma | null>(null);
  const d = dims.includes(dim) ? dim : dims[0];
  const m = medida === "__registros" || !tabla?.medidas.includes(medida) ? null : medida;
  const c: Calculo | undefined = !m ? undefined : calculo === "auto" ? agregacionDe(tabla!, m) : calculo;
  const esFecha = tabla?.fechas.includes(d) ?? false;
  const sumable = !m || c === "sum";

  const barras = useMemo(() => (tabla && d && !esFecha ? porCategoria(tabla, filas, d, m, c) : []), [tabla, filas, d, m, c, esFecha]);
  const serie = useMemo(() => (tabla && d && esFecha ? serieTemporal(tabla, filas, d, periodo, m, c) : []), [tabla, filas, d, m, c, esFecha, periodo]);
  if (!tabla || !d) return null;

  const etiquetaCalc = m ? `${CALCULOS.find((x) => x.valor === c)?.texto} de ${m}` : "Registros";
  const formas: { valor: Forma; texto: string }[] = esFecha
    ? [
        { valor: "area", texto: "Área" },
        { valor: "columnas", texto: "Columnas" },
      ]
    : [
        { valor: "barras", texto: "Barras" },
        ...(sumable ? [{ valor: "treemap" as const, texto: "Treemap" }] : []),
      ];
  const f = forma && formas.some((x) => x.valor === forma) ? forma : formas[0].valor;
  const colorDe = columna(tabla, d)?.tonos ? colorPorEntidad(tabla, d) : undefined;
  const top = barras.slice(0, 30);

  return (
    <Panel
      titulo="Arma tu propio gráfico"
      subtitulo={`${etiquetaCalc} por ${d}${!esFecha && barras.length > 30 ? ` · se muestran los 30 mayores de ${barras.length}` : ""}`}
      acciones={
        <>
          <Selector etiqueta="Agrupar por" valor={d} opciones={dims.map((x) => ({ valor: x, texto: x }))} onChange={setDim} />
          <Selector
            etiqueta="Medida"
            valor={m ?? "__registros"}
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
          {esFecha && (
            <Selector etiqueta="Periodo" valor={periodo} opciones={(Object.keys(PERIODOS) as Periodo[]).map((p) => ({ valor: p, texto: PERIODOS[p] }))} onChange={setPeriodo} />
          )}
          {formas.length > 1 && <Segmentado etiqueta="Forma" valor={f} onChange={setForma} opciones={formas} />}
        </>
      }
    >
      {f === "area" && <AreaTendencia puntos={serie} nombre={etiquetaCalc} etiqueta={`${etiquetaCalc} por ${d}`} sumable={sumable} alto={420} brush />}
      {f === "columnas" && (
        <ApiladoComposicion
          etiquetas={serie.map((p) => p.etiqueta)}
          series={[{ nombre: etiquetaCalc, color: "var(--s1)", datos: serie.map((p) => (Number.isFinite(p.valor) ? p.valor : 0)) }]}
          etiqueta={`${etiquetaCalc} por ${d}`}
          alto={420}
          unidad=""
        />
      )}
      {f === "barras" && (
        <BarrasRanking
          barras={top}
          nombre={etiquetaCalc}
          etiqueta={`${etiquetaCalc} por ${d}`}
          seleccionados={filtros.categorias[d]}
          onSeleccionar={(v) => alternarFiltro(d, v)}
          colorDe={colorDe}
          sumable={sumable}
        />
      )}
      {f === "treemap" && (
        <Treemap
          barras={top}
          nombre={etiquetaCalc}
          etiqueta={`Treemap de ${etiquetaCalc} por ${d}`}
          colorDe={colorPorEntidad(tabla, d)}
          seleccionados={filtros.categorias[d]}
          onSeleccionar={(v) => alternarFiltro(d, v)}
          pista="Clic para filtrar el dashboard"
          alto={420}
        />
      )}
    </Panel>
  );
}
