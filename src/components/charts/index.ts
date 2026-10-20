/**
 * Kit de gráficos: Recharts 3 + visx, colores desde variables CSS (--s1…--s8, estados,
 * secuencial y divergente), tooltips enriquecidos y animaciones que respetan
 * prefers-reduced-motion. Contrato de datos: los tipos de @/lib/calculo (Barra, Punto).
 */
export { Leyenda, Marco, Tip, pieTip, type FilaTip } from "./base";
export { colorPorEntidad, COLOR_ESTADO, COLOR_OTROS, mezcla, OTROS, porcentaje, serie, useAnimar, useOscuro } from "./tema";
export { Chispa, KpiHero, type Delta, type Sentido } from "./KpiHero";
export { AreaTendencia, type Rango } from "./AreaTendencia";
export { BarrasRanking } from "./BarrasRanking";
export { ApiladoComposicion, BarraComposicion, type Segmento, type SerieApilada } from "./ApiladoComposicion";
export { RadialSalud, type GrupoSalud } from "./RadialSalud";
export { Treemap } from "./Treemap";
export { MapaCalor, type Celda } from "./MapaCalor";
export { PuntosVsPromedio } from "./PuntosVsPromedio";
export { Histograma } from "./Histograma";
export { Dispersion, type SerieDispersion } from "./Dispersion";
