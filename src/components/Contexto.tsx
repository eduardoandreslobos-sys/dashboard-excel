"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { leerExcel, type Fila, type Tabla } from "@/lib/analisis";
import { elegirVinculado, guardarUltimo, leerUltimo, olvidarUltimo, type ManejadorArchivo, type Meta } from "@/lib/archivo";
import type { Periodo } from "@/lib/calculo";
import { aplicarFiltros, SIN_FILTROS, type Filtros } from "@/lib/hallazgos";

export type Vista = "resumen" | "tendencias" | "segmentos" | "riesgo" | "relaciones" | "explorar" | "datos" | "lectura";

export const MUESTRAS = [
  { nombre: "Hipotecarios_Santander_2025.xlsx", ruta: "/datos/Hipotecarios_Santander_2025.xlsx", descripcion: "1.200 créditos hipotecarios" },
  { nombre: "ejemplo.xlsx", ruta: "/datos/ejemplo.xlsx", descripcion: "Ventas diarias por región y producto" },
];

interface Estado {
  cargando: boolean;
  error: string | null;
  meta: Meta | null;
  tablas: Tabla[];
  tabla: Tabla | null;
  /** Filas de la tabla con todos los filtros aplicados. */
  filas: Fila[];
  filtros: Filtros;
  medida: string | null;
  vista: Vista;
  periodo: Periodo;
  enVivo: boolean;
  setTabla: (id: string) => void;
  setMedida: (m: string | null) => void;
  setVista: (v: Vista) => void;
  setPeriodo: (p: Periodo) => void;
  alternarFiltro: (columna: string, valor: string) => void;
  setFiltro: (columna: string, valores: string[]) => void;
  setRango: (columna: string, rango: [number, number] | null) => void;
  limpiarFiltros: () => void;
  cargarArchivo: (archivo: File) => Promise<void>;
  cargarMuestra: (ruta: string, nombre: string) => Promise<void>;
  vincular: () => Promise<void>;
  desvincular: () => void;
}

const Ctx = createContext<Estado | null>(null);

/** Filas con todos los filtros salvo el de `columna`: el gráfico de esa columna sigue mostrando todos sus valores. */
export function useFilasExcepto(columna: string): Fila[] {
  const { tabla, filtros } = useDash();
  return useMemo(() => (tabla ? aplicarFiltros(tabla.filas, filtros, columna) : []), [tabla, filtros, columna]);
}

export function useDash(): Estado {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDash fuera de <ProveedorDash>");
  return c;
}

function tablaPrincipal(tablas: Tabla[]): Tabla | null {
  return [...tablas].sort((a, b) => Number(b.esDetalle) - Number(a.esDetalle) || b.filas.length * b.columnas.length - a.filas.length * a.columnas.length)[0] ?? null;
}

export function ProveedorDash({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [tablas, setTablas] = useState<Tabla[]>([]);
  const [tablaId, setTablaId] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const [medida, setMedida] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("resumen");
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [enVivo, setEnVivo] = useState(false);
  const manejador = useRef<ManejadorArchivo | null>(null);
  const ultimaFirma = useRef(0);

  const tabla = useMemo(() => tablas.find((t) => t.id === tablaId) ?? null, [tablas, tablaId]);
  const filas = useMemo(() => (tabla ? aplicarFiltros(tabla.filas, filtros) : []), [tabla, filtros]);

  /** Procesa un Excel. `conservar` mantiene vista/filtros (recarga del mismo archivo). */
  const procesar = useCallback((datos: ArrayBuffer, nuevaMeta: Meta, conservar = false) => {
    try {
      const nuevas = leerExcel(datos);
      if (!nuevas.length) throw new Error("No encontré tablas con encabezados en este archivo.");
      setTablas(nuevas);
      setMeta(nuevaMeta);
      setError(null);
      setTablaId((actual) => (conservar && nuevas.some((t) => t.id === actual) ? actual : tablaPrincipal(nuevas)!.id));
      if (!conservar) {
        setFiltros(SIN_FILTROS);
        setMedida(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude leer el archivo.");
    } finally {
      setCargando(false);
    }
  }, []);

  const cargarMuestra = useCallback(
    async (ruta: string, nombre: string) => {
      setCargando(true);
      manejador.current = null;
      setEnVivo(false);
      const r = await fetch(ruta);
      const datos = await r.arrayBuffer();
      procesar(datos, { nombre, tamano: datos.byteLength, modificado: Date.now(), origen: "muestra" });
      olvidarUltimo();
    },
    [procesar],
  );

  const cargarArchivo = useCallback(
    async (archivo: File) => {
      setCargando(true);
      manejador.current = null;
      setEnVivo(false);
      const datos = await archivo.arrayBuffer();
      const m: Meta = { nombre: archivo.name, tamano: archivo.size, modificado: archivo.lastModified, origen: "subido" };
      procesar(datos, m);
      guardarUltimo(datos, m);
    },
    [procesar],
  );

  const vincular = useCallback(async () => {
    const h = await elegirVinculado();
    if (!h) return;
    const archivo = await h.getFile();
    manejador.current = h;
    ultimaFirma.current = archivo.lastModified;
    const datos = await archivo.arrayBuffer();
    procesar(datos, { nombre: archivo.name, tamano: archivo.size, modificado: archivo.lastModified, origen: "vinculado" });
    setEnVivo(true);
  }, [procesar]);

  const desvincular = useCallback(() => {
    manejador.current = null;
    setEnVivo(false);
  }, []);

  // Carga inicial: el último archivo de este navegador, o la muestra de hipotecarios.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const ultimo = await leerUltimo();
      if (cancelado) return;
      if (ultimo) procesar(ultimo.datos, ultimo.meta);
      else await cargarMuestra(MUESTRAS[0].ruta, MUESTRAS[0].nombre);
    })().catch(() => setError("No pude cargar los datos iniciales."));
    return () => {
      cancelado = true;
    };
  }, [procesar, cargarMuestra]);

  // Archivo vinculado: revisa cada 3 s si cambió en disco y recarga conservando la vista.
  useEffect(() => {
    if (!enVivo) return;
    const id = setInterval(async () => {
      const h = manejador.current;
      if (!h) return;
      try {
        const archivo = await h.getFile();
        if (archivo.lastModified !== ultimaFirma.current) {
          ultimaFirma.current = archivo.lastModified;
          procesar(await archivo.arrayBuffer(), { nombre: archivo.name, tamano: archivo.size, modificado: archivo.lastModified, origen: "vinculado" }, true);
        }
      } catch {
        setEnVivo(false);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [enVivo, procesar]);

  const setTabla = useCallback((id: string) => {
    setTablaId(id);
    setFiltros(SIN_FILTROS);
    setMedida(null);
  }, []);

  const alternarFiltro = useCallback((columna: string, valor: string) => {
    setFiltros((f) => {
      const actuales = f.categorias[columna] ?? [];
      const nuevos = actuales.includes(valor) ? actuales.filter((v) => v !== valor) : [...actuales, valor];
      return { ...f, categorias: { ...f.categorias, [columna]: nuevos } };
    });
  }, []);

  const setFiltro = useCallback((columna: string, valores: string[]) => {
    setFiltros((f) => ({ ...f, categorias: { ...f.categorias, [columna]: valores } }));
  }, []);

  const setRango = useCallback((columna: string, rango: [number, number] | null) => {
    setFiltros((f) => {
      const fechas = { ...f.fechas };
      if (rango) fechas[columna] = rango;
      else delete fechas[columna];
      return { ...f, fechas };
    });
  }, []);

  const limpiarFiltros = useCallback(() => setFiltros(SIN_FILTROS), []);

  const valor: Estado = {
    cargando,
    error,
    meta,
    tablas,
    tabla,
    filas,
    filtros,
    medida: medida ?? tabla?.medidaPrincipal ?? null,
    vista,
    periodo,
    enVivo,
    setTabla,
    setMedida,
    setVista,
    setPeriodo,
    alternarFiltro,
    setFiltro,
    setRango,
    limpiarFiltros,
    cargarArchivo,
    cargarMuestra,
    vincular,
    desvincular,
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
