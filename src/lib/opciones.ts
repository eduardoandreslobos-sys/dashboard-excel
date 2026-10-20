/** Constructores de opciones ECharts: una sola paleta, un solo eje Y, marcas finas. */
import type { EChartsCoreOption } from "echarts/core";
import { ejeCategoria, ejeValor, type Tokens } from "@/components/Grafico";
import { compacto, formato, type Barra, type Punto } from "./calculo";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function filaTooltip(color: string, nombre: string, valor: string) {
  return `<div style="display:flex;align-items:center;gap:8px;justify-content:space-between;min-width:160px">
    <span style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:2px;background:${color}"></span>${esc(nombre)}</span>
    <b style="font-family:var(--font-geist-mono);font-variant-numeric:tabular-nums">${valor}</b></div>`;
}

/** Acorta etiquetas largas (el tooltip muestra el nombre completo). */
const corta = (s: string, max = 22) => (s.length > max ? s.slice(0, max - 1) + "…" : s);

const tituloTooltip = (t: Tokens, s: string) => `<div style="color:${t.text3};font-size:11px;margin-bottom:4px">${esc(s)}</div>`;

/** Barras horizontales ordenadas; resalta las seleccionadas por filtro cruzado. */
export function barrasH(
  t: Tokens,
  barras: Barra[],
  opts: { nombre: string; color?: string; seleccionados?: string[]; colores?: Record<string, string>; total?: number },
): EChartsCoreOption {
  const sel = new Set(opts.seleccionados ?? []);
  const total = opts.total ?? barras.reduce((s, b) => s + (Number.isFinite(b.valor) ? b.valor : 0), 0);
  const datos = [...barras].reverse();
  return {
    grid: { left: 8, right: 56, top: 4, bottom: 4, containLabel: true },
    xAxis: { type: "value", ...ejeValor(t), axisLabel: { show: false }, splitLine: { show: false } },
    yAxis: {
      type: "category",
      data: datos.map((b) => b.etiqueta),
      ...ejeCategoria(t),
      axisLine: { show: false },
      axisLabel: { color: t.text2, fontSize: 12, formatter: (v: string) => corta(v) },
    },
    tooltip: {
      trigger: "item",
      formatter: (p: { dataIndex: number; color: string }) => {
        const b = datos[p.dataIndex];
        const pct = total ? ` · ${formato((b.valor / total) * 100)} %` : "";
        return tituloTooltip(t, b.etiqueta) + filaTooltip(p.color, opts.nombre, formato(b.valor) + pct) +
          `<div style="color:${t.text3};font-size:11px;margin-top:4px">${formato(b.n)} registros · clic para filtrar</div>`;
      },
    },
    series: [
      {
        type: "bar",
        barMaxWidth: 22,
        barCategoryGap: "28%",
        data: datos.map((b) => ({
          value: b.valor,
          itemStyle: {
            color: opts.colores?.[b.etiqueta] ?? opts.color ?? t.series[0],
            opacity: sel.size && !sel.has(b.etiqueta) ? 0.3 : 1,
            borderRadius: [0, 4, 4, 0],
          },
        })),
        label: {
          show: true,
          position: "right",
          color: t.text2,
          fontSize: 11,
          fontFamily: t.mono,
          formatter: (p: { value: number }) => compacto(p.value),
        },
        emphasis: { itemStyle: { opacity: 1 } },
      },
    ],
  };
}

/** Columnas por periodo (conteo). */
export function columnas(t: Tokens, puntos: Punto[], nombre: string): EChartsCoreOption {
  return {
    xAxis: { type: "category", data: puntos.map((p) => p.etiqueta), ...ejeCategoria(t) },
    yAxis: { type: "value", ...ejeValor(t), axisLabel: { color: t.text3, formatter: compacto } },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: t.grid } },
      formatter: (ps: { dataIndex: number; color: string }[]) =>
        tituloTooltip(t, puntos[ps[0].dataIndex].etiqueta) + filaTooltip(ps[0].color, nombre, formato(puntos[ps[0].dataIndex].valor)),
    },
    series: [{ type: "bar", data: puntos.map((p) => p.valor), itemStyle: { color: t.series[0], borderRadius: [4, 4, 0, 0] }, barMaxWidth: 28 }],
  };
}

/** Línea temporal con área, anotaciones de máximo/mínimo y promedio del periodo. */
export function linea(t: Tokens, puntos: Punto[], nombre: string, color = t.series[1]): EChartsCoreOption {
  const validos = puntos.filter((p) => Number.isFinite(p.valor));
  const prom = validos.reduce((s, p) => s + p.valor, 0) / (validos.length || 1);
  return {
    legend: { show: false },
    grid: { left: 8, right: 24, top: 28, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: puntos.map((p) => p.etiqueta), boundaryGap: false, ...ejeCategoria(t) },
    yAxis: { type: "value", scale: true, ...ejeValor(t), axisLabel: { color: t.text3, formatter: compacto } },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: t.border } },
      formatter: (ps: { dataIndex: number }[]) => {
        const p = puntos[ps[0].dataIndex];
        const dif = Number.isFinite(p.valor) ? ((p.valor / prom - 1) * 100) : NaN;
        return tituloTooltip(t, p.etiqueta) + filaTooltip(color, nombre, formato(p.valor)) +
          `<div style="color:${t.text3};font-size:11px;margin-top:4px">${formato(p.n)} registros${Number.isFinite(dif) ? ` · ${dif >= 0 ? "+" : ""}${formato(dif)} % vs promedio` : ""}</div>`;
      },
    },
    series: [
      {
        type: "line",
        name: nombre,
        data: puntos.map((p) => (Number.isFinite(p.valor) ? p.valor : null)),
        smooth: 0.25,
        symbol: "circle",
        symbolSize: 7,
        showSymbol: puntos.length <= 24,
        lineStyle: { width: 2, color },
        itemStyle: { color, borderColor: t.surface, borderWidth: 2 },
        areaStyle: {
          color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: color + "33" }, { offset: 1, color: color + "00" }] },
        },
        markPoint: {
          symbol: "circle",
          symbolSize: 8,
          itemStyle: { color, borderColor: t.surface, borderWidth: 2 },
          label: { show: true, position: "top", color: t.text2, fontSize: 11, fontFamily: t.mono, formatter: (p: { value: number; name: string }) => `${p.name === "max" ? "▲" : "▼"} ${compacto(p.value)}` },
          data: [
            { type: "max", name: "max" },
            { type: "min", name: "min", label: { position: "bottom" } },
          ],
        },
        markLine: {
          symbol: "none",
          silent: true,
          lineStyle: { color: t.text3, type: "dashed", width: 1 },
          label: { color: t.text3, fontSize: 10, formatter: `prom. ${compacto(prom)}`, position: "insideEndTop" },
          data: [{ yAxis: prom }],
        },
      },
    ],
  };
}

/** Barras apiladas por periodo y categoría (≤ 8 series, color fijo por entidad). */
export function apiladas(
  t: Tokens,
  etiquetas: string[],
  series: { nombre: string; datos: number[]; color: string }[],
): EChartsCoreOption {
  return {
    grid: { left: 8, right: 16, top: 16, bottom: 36, containLabel: true },
    xAxis: { type: "category", data: etiquetas, ...ejeCategoria(t) },
    yAxis: { type: "value", ...ejeValor(t), axisLabel: { color: t.text3, formatter: compacto } },
    legend: { bottom: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: t.text2, fontSize: 12 } },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: t.grid } },
      formatter: (ps: { dataIndex: number; seriesName: string; value: number; color: string }[]) => {
        const total = ps.reduce((s, p) => s + (p.value || 0), 0);
        return tituloTooltip(t, etiquetas[ps[0].dataIndex]) +
          [...ps].reverse().map((p) => filaTooltip(p.color, p.seriesName, `${formato(p.value)} · ${formato(total ? (p.value / total) * 100 : 0)} %`)).join("") +
          `<div style="border-top:1px solid ${t.border};margin-top:6px;padding-top:4px">${filaTooltip("transparent", "Total", formato(total))}</div>`;
      },
    },
    series: series.map((s, i) => ({
      type: "bar",
      name: s.nombre,
      stack: "total",
      data: s.datos,
      barMaxWidth: 32,
      itemStyle: { color: s.color, borderColor: t.surface, borderWidth: 1, borderRadius: i === series.length - 1 ? [4, 4, 0, 0] : 0 },
    })),
  };
}

export function histograma(t: Tokens, cubetas: { desde: number; hasta: number; n: number }[], promedio: number, nombre: string): EChartsCoreOption {
  const ancho = cubetas.length ? cubetas[0].hasta - cubetas[0].desde : 1;
  return {
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    xAxis: { type: "value", min: cubetas[0]?.desde, max: cubetas.at(-1)?.hasta, ...ejeCategoria(t), axisLabel: { color: t.text3, formatter: compacto } },
    yAxis: { type: "value", ...ejeValor(t) },
    tooltip: {
      trigger: "item",
      formatter: (p: { dataIndex: number }) => {
        const c = cubetas[p.dataIndex];
        return tituloTooltip(t, `${nombre}: ${compacto(c.desde)} – ${compacto(c.hasta)}`) + filaTooltip(t.series[0], "Registros", formato(c.n));
      },
    },
    series: [
      {
        type: "bar",
        barWidth: "92%",
        data: cubetas.map((c) => [c.desde + ancho / 2, c.n]),
        itemStyle: { color: t.series[0], borderRadius: [3, 3, 0, 0], opacity: 0.85 },
        markLine: {
          symbol: "none",
          silent: true,
          lineStyle: { color: t.text2, type: "dashed" },
          label: { color: t.text2, fontSize: 10, formatter: `prom. ${compacto(promedio)}` },
          data: [{ xAxis: promedio }],
        },
      },
    ],
  };
}

export function mapaCalor(
  t: Tokens,
  x: string[],
  y: string[],
  datos: [number, number, number][],
  opts: { divergente?: boolean; nombre: string; decimales?: boolean },
): EChartsCoreOption {
  const valores = datos.map((d) => d[2]).filter(Number.isFinite);
  return {
    grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: x, ...ejeCategoria(t), axisLine: { show: false }, axisLabel: { color: t.text2, fontSize: 11, rotate: x.length > 6 ? 30 : 0, formatter: (v: string) => corta(v, 16) }, splitArea: { show: false } },
    yAxis: { type: "category", data: y, inverse: true, ...ejeCategoria(t), axisLine: { show: false }, axisLabel: { color: t.text2, fontSize: 11, formatter: (v: string) => corta(v) } },
    visualMap: {
      show: false,
      min: opts.divergente ? -1 : Math.min(...valores),
      max: opts.divergente ? 1 : Math.max(...valores),
      inRange: { color: opts.divergente ? [t.divNeg, t.divMid, t.divPos] : [t.seq0, t.seq1, t.seq2, t.seq3, t.seq4] },
    },
    tooltip: {
      formatter: (p: { value: [number, number, number] }) =>
        tituloTooltip(t, `${y[p.value[1]]} × ${x[p.value[0]]}`) + filaTooltip(t.accent, opts.nombre, formato(p.value[2])),
    },
    series: [
      {
        type: "heatmap",
        data: datos,
        itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 4 },
        label: {
          show: true,
          fontSize: 11,
          fontFamily: t.mono,
          formatter: (p: { value: [number, number, number] }) => (opts.decimales ? formato(p.value[2]) : compacto(p.value[2])),
          color: t.text,
        },
      },
    ],
  };
}

export function dispersion(
  t: Tokens,
  grupos: { nombre: string; color: string; puntos: [number, number][] }[],
  ejes: { x: string; y: string },
): EChartsCoreOption {
  return {
    grid: { left: 8, right: 16, top: 32, bottom: grupos.length > 1 ? 44 : 16, containLabel: true },
    xAxis: { type: "value", name: ejes.x, nameLocation: "middle", nameGap: 26, nameTextStyle: { color: t.text3 }, scale: true, ...ejeValor(t), axisLabel: { color: t.text3, formatter: compacto } },
    yAxis: { type: "value", name: ejes.y, nameGap: 14, nameTextStyle: { color: t.text3, align: "left" }, scale: true, ...ejeValor(t), axisLabel: { color: t.text3, formatter: compacto } },
    legend: grupos.length > 1 ? { bottom: 0, icon: "circle", textStyle: { color: t.text2 } } : { show: false },
    tooltip: {
      trigger: "item",
      formatter: (p: { value: [number, number]; seriesName: string; color: string }) =>
        tituloTooltip(t, p.seriesName) + filaTooltip(p.color, ejes.x, formato(p.value[0])) + filaTooltip(p.color, ejes.y, formato(p.value[1])),
    },
    series: grupos.map((g) => ({
      type: "scatter",
      name: g.nombre,
      data: g.puntos,
      symbolSize: 8,
      itemStyle: { color: g.color, opacity: 0.7, borderColor: t.surface, borderWidth: 1 },
      emphasis: { itemStyle: { opacity: 1 } },
    })),
  };
}

/** Gráfico de puntos: promedio por categoría comparado con el promedio general. */
export function puntosVsPromedio(t: Tokens, barras: Barra[], general: number, nombre: string, seleccionados: string[] = []): EChartsCoreOption {
  const sel = new Set(seleccionados);
  const datos = [...barras].reverse();
  const vals = datos.map((b) => b.valor).concat(general).filter(Number.isFinite);
  const rango = Math.max(...vals) - Math.min(...vals) || 1;
  return {
    grid: { left: 8, right: 48, top: 20, bottom: 8, containLabel: true },
    xAxis: { type: "value", min: Math.min(...vals) - rango * 0.15, max: Math.max(...vals) + rango * 0.15, ...ejeValor(t), axisLabel: { color: t.text3, formatter: compacto } },
    yAxis: { type: "category", data: datos.map((b) => b.etiqueta), ...ejeCategoria(t), axisLine: { show: false }, axisLabel: { color: t.text2, fontSize: 12, formatter: (v: string) => corta(v) }, splitLine: { show: true, lineStyle: { color: t.grid } } },
    tooltip: {
      trigger: "item",
      formatter: (p: { dataIndex: number }) => {
        const b = datos[p.dataIndex];
        const dif = b.valor - general;
        return tituloTooltip(t, b.etiqueta) + filaTooltip(t.series[0], nombre, formato(b.valor)) +
          `<div style="color:${t.text3};font-size:11px;margin-top:4px">${dif >= 0 ? "+" : ""}${formato(dif)} vs promedio general · ${formato(b.n)} registros</div>`;
      },
    },
    series: [
      {
        type: "scatter",
        symbolSize: 12,
        data: datos.map((b) => ({
          value: b.valor,
          itemStyle: { color: b.valor >= general ? t.series[0] : t.series[1], opacity: sel.size && !sel.has(b.etiqueta) ? 0.3 : 1, borderColor: t.surface, borderWidth: 2 },
        })),
        label: { show: true, position: "right", color: t.text2, fontSize: 11, fontFamily: t.mono, formatter: (p: { value: number }) => formato(p.value) },
        markLine: {
          symbol: "none",
          silent: true,
          lineStyle: { color: t.text3, type: "dashed" },
          label: { color: t.text3, fontSize: 10, formatter: `general ${formato(general)}`, position: "end" },
          data: [{ xAxis: general }],
        },
      },
    ],
  };
}
