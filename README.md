# Dashboard Excel

Sube cualquier archivo Excel y obtén un dashboard automático: KPIs con tendencia, hallazgos en lenguaje natural, tendencias, segmentos con drill-down, riesgo, correlaciones y una tabla navegable.

**Tus archivos se procesan solo en tu navegador**: no se envían a ningún servidor. El último archivo que subiste queda guardado en tu navegador para la próxima visita.

## Cómo se usa

1. Abre el dashboard. Parte con un archivo de muestra de 1.200 créditos hipotecarios ficticios.
2. Usa **Subir Excel**, o arrastra el archivo sobre la página.
3. Para que se actualice solo mientras editas el Excel, usa **⋯ → Vincular archivo local (en vivo)** (Chrome/Edge). El dashboard revisa el archivo cada 3 segundos.

## Qué entiende del archivo

- **Tablas**: detecta cada tabla de cada hoja, aunque tenga títulos, notas al pie, filas de «Total» o varias tablas en una misma hoja.
- **Columnas**: reconoce fechas, identificadores, categorías y medidas. Los montos se **suman**; las tasas, porcentajes y plazos se **promedian**.
- **Jerarquías** (p. ej. Región → Sucursal): habilitan el drill-down.
- **Columnas de estado** (p. ej. Vigente, En mora, Castigado): les asigna un color semántico con ícono y calcula el riesgo por segmento.
- La pestaña **Cómo lo entendí** muestra esa interpretación columna por columna.

## Interacción

- **Clic en cualquier barra** filtra todo el dashboard (filtro cruzado); los filtros activos aparecen como etiquetas, cada una con su ×.
- **⌘K / Ctrl+K**: paleta de comandos para ir a una vista, cambiar la medida, filtrar por cualquier valor o cambiar el tema.
- Tema claro, oscuro o el del sistema, y densidad cómoda o compacta (menú **⋯**).
- Exportación a CSV de los datos filtrados.

## Stack

Next.js 16 · React 19 · Tailwind CSS 4 · Apache ECharts 6 (SVG) · SheetJS 0.20 · cmdk · lucide-react · fuentes Geist / Geist Mono.

La paleta de gráficos es categórica y fue validada para daltonismo en modo claro y oscuro; los estados se muestran siempre con ícono y texto, nunca solo con color.

## Desarrollo

```bash
npm install
npm run dev
```

Abre http://localhost:3000.

Código principal:

- `src/lib/analisis.ts`: motor que interpreta el Excel.
- `src/lib/calculo.ts`, `src/lib/hallazgos.ts`: agregaciones e insights.
- `src/lib/opciones.ts`: estilos de los gráficos.
- `src/components/`: interfaz (`Dashboard.tsx`, `vistas/*`).
