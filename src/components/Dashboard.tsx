"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Command } from "cmdk";
import {
  BarChart3, Calendar, Check, ChevronDown, Command as CmdIcon, Database, FileSpreadsheet, Filter, Layers,
  LayoutDashboard, Link2, Link2Off, Monitor, Moon, MoreHorizontal, Network, Rows3, ScanSearch, Sparkles, Sun,
  Table2, TrendingUp, Upload, X,
} from "lucide-react";
import { MUESTRAS, ProveedorDash, useDash, type Vista } from "./Contexto";
import { Resumen, Tendencias, nombreMedida } from "./vistas/Resumen";
import { Distribucion, Relaciones, Segmentos } from "./vistas/Segmentos";
import { Datos, Explorador, Lectura } from "./vistas/Datos";
import { Vacio } from "./ui";
import { columna } from "@/lib/analisis";
import { fechaCorta, formato, porCategoria } from "@/lib/calculo";
import { cantidadFiltros } from "@/lib/hallazgos";
import { puedeVincular } from "@/lib/archivo";

const VISTAS: { id: Vista; texto: string; icono: typeof LayoutDashboard }[] = [
  { id: "resumen", texto: "Resumen", icono: LayoutDashboard },
  { id: "tendencias", texto: "Tendencias", icono: TrendingUp },
  { id: "segmentos", texto: "Segmentos", icono: Layers },
  { id: "riesgo", texto: "Distribución", icono: BarChart3 },
  { id: "relaciones", texto: "Relaciones", icono: Network },
  { id: "explorar", texto: "Explorador", icono: ScanSearch },
  { id: "datos", texto: "Datos", icono: Table2 },
  { id: "lectura", texto: "Cómo lo entendí", icono: Sparkles },
];

type Tema = "light" | "dark" | "system";

function usePreferencias() {
  const [tema, setTemaEstado] = useState<Tema>("system");
  const [densidad, setDensidadEstado] = useState<"comodo" | "compacto">("comodo");
  useEffect(() => {
    // Sincroniza con lo que aplicó el script del layout antes del primer pintado.
    const d = document.documentElement.dataset;
    /* eslint-disable react-hooks/set-state-in-effect */
    setTemaEstado((d.theme as Tema) ?? "system");
    setDensidadEstado(d.density === "compacto" ? "compacto" : "comodo");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const setTema = useCallback((t: Tema) => {
    setTemaEstado(t);
    const raiz = document.documentElement;
    try {
      if (t === "system") {
        delete raiz.dataset.theme;
        localStorage.removeItem("tema");
      } else {
        raiz.dataset.theme = t;
        localStorage.setItem("tema", t);
      }
    } catch {}
  }, []);
  const setDensidad = useCallback((v: "comodo" | "compacto") => {
    setDensidadEstado(v);
    document.documentElement.dataset.density = v;
    try {
      localStorage.setItem("densidad", v);
    } catch {}
  }, []);
  return { tema, setTema, densidad, setDensidad };
}

/** Menú desplegable simple que se cierra al hacer clic fuera o con Escape. */
function Desplegable({ boton, children, ancho = 280, alinear = "izq" }: { boton: (abrir: () => void, abierto: boolean) => ReactNode; children: (cerrar: () => void) => ReactNode; ancho?: number; alinear?: "izq" | "der" }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setAbierto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);
  return (
    <div ref={ref} className="relative">
      {boton(() => setAbierto((a) => !a), abierto)}
      {abierto && (
        <div
          className="card fade-in absolute z-40 mt-2 max-w-[calc(100vw-32px)] overflow-hidden"
          style={{ width: ancho, boxShadow: "var(--shadow-pop)", [alinear === "izq" ? "left" : "right"]: 0 }}
        >
          {children(() => setAbierto(false))}
        </div>
      )}
    </div>
  );
}

function ItemMenu({ icono: Icono, children, onClick, activo }: { icono: typeof Sun; children: ReactNode; onClick: () => void; activo?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-ink-2 hover:bg-surface-hover hover:text-ink">
      <Icono size={15} className="text-ink-3" aria-hidden />
      <span className="flex-1">{children}</span>
      {activo && <Check size={14} className="text-accent" aria-hidden />}
    </button>
  );
}

// ---------------------------------------------------------------- Barra superior

type Prefs = ReturnType<typeof usePreferencias>;

function BarraSuperior({ abrirPaleta, subir, prefs }: { abrirPaleta: () => void; subir: () => void; prefs: Prefs }) {
  const { meta, enVivo, vincular, desvincular, cargarMuestra } = useDash();
  const { tema, setTema, densidad, setDensidad } = prefs;
  return (
    <header className="sticky top-0 z-30 border-b border-line" style={{ background: "color-mix(in srgb, var(--bg) 78%, transparent)", backdropFilter: "saturate(1.6) blur(14px)", WebkitBackdropFilter: "saturate(1.6) blur(14px)" }}>
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white" style={{ background: "linear-gradient(135deg, var(--s1), var(--s7))" }}>
            <BarChart3 size={17} aria-hidden />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="text-[13px] font-semibold text-ink">Dashboard Excel</p>
            <p className="flex items-center gap-1.5 truncate text-[12px] text-ink-3">
              {enVivo && <span className="pulse inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--ok)" }} aria-label="En vivo" />}
              <span className="truncate">{meta?.nombre ?? "Cargando…"}</span>
            </p>
          </div>
        </div>
        <div className="flex-1" />
        <button type="button" onClick={abrirPaleta} className="ctl hidden w-64 justify-between text-ink-3 md:inline-flex" aria-label="Abrir paleta de comandos">
          <span className="inline-flex items-center gap-2">
            <ScanSearch size={14} aria-hidden /> Buscar o ir a…
          </span>
          <kbd>⌘K</kbd>
        </button>
        <button type="button" onClick={abrirPaleta} className="ctl px-2 md:hidden" aria-label="Abrir paleta de comandos">
          <CmdIcon size={15} />
        </button>
        <button type="button" onClick={subir} className="ctl ctl-primary">
          <Upload size={14} aria-hidden /> <span className="hidden sm:inline">Subir Excel</span>
        </button>
        <Desplegable
          alinear="der"
          ancho={270}
          boton={(abrir) => (
            <button type="button" onClick={abrir} className="ctl px-2" aria-label="Más opciones">
              <MoreHorizontal size={16} />
            </button>
          )}
        >
          {(cerrar) => (
            <div className="p-1.5">
              <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Archivo</p>
              {puedeVincular() &&
                (enVivo ? (
                  <ItemMenu icono={Link2Off} onClick={() => { desvincular(); cerrar(); }}>Dejar de vigilar el archivo</ItemMenu>
                ) : (
                  <ItemMenu icono={Link2} onClick={() => { vincular(); cerrar(); }}>Vincular archivo local (en vivo)</ItemMenu>
                ))}
              {MUESTRAS.map((m) => (
                <ItemMenu key={m.ruta} icono={FileSpreadsheet} onClick={() => { cargarMuestra(m.ruta, m.nombre); cerrar(); }}>
                  Muestra: {m.descripcion}
                </ItemMenu>
              ))}
              <div className="my-1.5 border-t border-line" />
              <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Tema</p>
              <ItemMenu icono={Sun} onClick={() => setTema("light")} activo={tema === "light"}>Claro</ItemMenu>
              <ItemMenu icono={Moon} onClick={() => setTema("dark")} activo={tema === "dark"}>Oscuro</ItemMenu>
              <ItemMenu icono={Monitor} onClick={() => setTema("system")} activo={tema === "system"}>Según el sistema</ItemMenu>
              <div className="my-1.5 border-t border-line" />
              <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Densidad</p>
              <ItemMenu icono={Rows3} onClick={() => setDensidad("comodo")} activo={densidad === "comodo"}>Cómoda</ItemMenu>
              <ItemMenu icono={Rows3} onClick={() => setDensidad("compacto")} activo={densidad === "compacto"}>Compacta</ItemMenu>
            </div>
          )}
        </Desplegable>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------- Encabezado + filtros

function Encabezado() {
  const { tabla, tablas, setTabla, filas, meta, medida, setMedida } = useDash();
  if (!tabla) return null;
  const titulo = (meta?.nombre ?? "").replace(/\.xlsx?$/i, "").replace(/_/g, " ");
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold tracking-tight text-ink sm:text-[30px]">{titulo}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-3">
          <span className="inline-flex items-center gap-1"><Database size={13} aria-hidden /> {tabla.nombre}</span>
          <span aria-hidden>·</span>
          <span><span className="num text-ink-2">{formato(filas.length)}</span> de {formato(tabla.filas.length)} registros</span>
          {meta && (
            <>
              <span aria-hidden>·</span>
              <span>{meta.origen === "muestra" ? "archivo de muestra" : `modificado ${fechaCorta(new Date(meta.modificado))}`}</span>
            </>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {tablas.length > 1 && (
          <label className="flex items-center gap-2 text-[12px] text-ink-3">
            Tabla
            <select className="ctl max-w-[260px]" value={tabla.id} onChange={(e) => setTabla(e.target.value)} aria-label="Tabla">
              {tablas.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre} ({formato(t.filas.length)})</option>
              ))}
            </select>
          </label>
        )}
        {tabla.medidas.length > 0 && tabla.esDetalle && (
          <label className="flex items-center gap-2 text-[12px] text-ink-3">
            Medida
            <select className="ctl max-w-[240px]" value={medida ?? ""} onChange={(e) => setMedida(e.target.value)} aria-label="Medida para los gráficos">
              {tabla.medidas.map((m) => (
                <option key={m} value={m}>{nombreMedida(tabla, m)}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}

function ListaValores({ col }: { col: string }) {
  const { tabla, filtros, setFiltro, alternarFiltro } = useDash();
  const [q, setQ] = useState("");
  const valores = useMemo(() => (tabla ? porCategoria(tabla, tabla.filas, col, null) : []), [tabla, col]);
  const sel = filtros.categorias[col] ?? [];
  const visibles = valores.filter((v) => v.etiqueta.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      {valores.length > 8 && (
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar en ${col}…`} aria-label={`Buscar en ${col}`}
          className="mb-1 h-8 w-full rounded-md border border-line bg-surface-2 px-2.5 text-[12px] text-ink outline-none placeholder:text-ink-3 focus:border-accent" />
      )}
      <div className="max-h-48 overflow-auto">
        {visibles.map((v) => (
          <label key={v.etiqueta} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[13px] text-ink-2 hover:bg-surface-hover">
            <input type="checkbox" className="accent-[var(--accent)]" checked={sel.includes(v.etiqueta)} onChange={() => alternarFiltro(col, v.etiqueta)} />
            <span className="flex-1 truncate">{v.etiqueta}</span>
            <span className="num text-[11px] text-ink-3">{formato(v.n)}</span>
          </label>
        ))}
      </div>
      {sel.length > 0 && (
        <button type="button" className="mt-1 text-[12px] text-accent hover:underline" onClick={() => setFiltro(col, [])}>Quitar selección</button>
      )}
    </div>
  );
}

function BarraFiltros() {
  const { tabla, filtros, setFiltro, setRango, limpiarFiltros } = useDash();
  const [abierta, setAbierta] = useState<string | null>(null);
  if (!tabla || !tabla.esDetalle) return null;
  const total = cantidadFiltros(filtros);
  const chips = [
    ...Object.entries(filtros.fechas).map(([c, [a, b]]) => ({ clave: c, texto: `${c}: ${fechaCorta(new Date(a))} → ${fechaCorta(new Date(b))}`, quitar: () => setRango(c, null) })),
    ...Object.entries(filtros.categorias).filter(([, v]) => v.length).map(([c, v]) => ({
      clave: c,
      texto: `${c}: ${v.length > 2 ? `${v.slice(0, 2).join(", ")} +${v.length - 2}` : v.join(", ")}`,
      quitar: () => setFiltro(c, []),
    })),
  ];
  const cats = tabla.categorias.filter((c) => columna(tabla, c).unicos <= 200);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Desplegable
        ancho={340}
        boton={(abrir, abierto) => (
          <button type="button" onClick={abrir} className="ctl" aria-expanded={abierto}>
            <Filter size={14} aria-hidden /> Filtros
            {total > 0 && <span className="num rounded-full bg-accent px-1.5 text-[11px] text-white">{total}</span>}
            <ChevronDown size={14} className="text-ink-3" aria-hidden />
          </button>
        )}
      >
        {() => (
          <div className="max-h-[70vh] overflow-auto p-2">
            {tabla.fechas.map((c) => <RangoFechas key={c} col={c} />)}
            {cats.map((c) => {
              const n = (filtros.categorias[c] ?? []).length;
              return (
                <div key={c} className="border-b border-line last:border-0">
                  <button type="button" onClick={() => setAbierta(abierta === c ? null : c)} className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-[13px] font-medium text-ink hover:bg-surface-hover" aria-expanded={abierta === c}>
                    <span>{c}</span>
                    <span className="flex items-center gap-1.5 text-[12px] font-normal text-ink-3">
                      {n ? `${n} elegido${n > 1 ? "s" : ""}` : "Todos"}
                      <ChevronDown size={14} className={`transition-transform ${abierta === c ? "rotate-180" : ""}`} aria-hidden />
                    </span>
                  </button>
                  {abierta === c && <div className="px-1 pb-2"><ListaValores col={c} /></div>}
                </div>
              );
            })}
          </div>
        )}
      </Desplegable>
      {chips.map((c) => (
        <span key={c.clave} className="chip fade-in">
          {c.texto}
          <button type="button" onClick={c.quitar} className="grid h-4 w-4 place-items-center rounded-full hover:bg-accent hover:text-white" aria-label={`Quitar filtro ${c.clave}`}>
            <X size={11} />
          </button>
        </span>
      ))}
      {total > 0 && (
        <button type="button" onClick={limpiarFiltros} className="text-[12px] font-medium text-ink-3 hover:text-ink">Limpiar todo</button>
      )}
      {total === 0 && <span className="text-[12px] text-ink-3">Tip: haz clic en cualquier barra para filtrar todo el dashboard.</span>}
    </div>
  );
}

function RangoFechas({ col }: { col: string }) {
  const { tabla, filtros, setRango } = useDash();
  const [min, max] = useMemo(() => {
    const ts = (tabla?.filas ?? []).map((f) => f[col]).filter((v): v is Date => v instanceof Date).map((d) => d.getTime());
    return [Math.min(...ts), Math.max(...ts)];
  }, [tabla, col]);
  if (!Number.isFinite(min)) return null;
  const [a, b] = filtros.fechas[col] ?? [min, max];
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const cambiar = (desde: number, hasta: number) => (desde <= min && hasta >= max ? setRango(col, null) : setRango(col, [desde, hasta]));
  return (
    <div className="border-b border-line px-2 py-2">
      <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-ink"><Calendar size={14} className="text-ink-3" aria-hidden /> {col}</p>
      <div className="flex items-center gap-2">
        <input type="date" className="ctl h-8 flex-1 px-2 text-[12px]" min={iso(min)} max={iso(max)} value={iso(a)} onChange={(e) => e.target.value && cambiar(Date.parse(e.target.value), b)} aria-label={`${col} desde`} />
        <span className="text-ink-3">→</span>
        <input type="date" className="ctl h-8 flex-1 px-2 text-[12px]" min={iso(min)} max={iso(max)} value={iso(b)} onChange={(e) => e.target.value && cambiar(a, Date.parse(e.target.value) + 864e5 - 1)} aria-label={`${col} hasta`} />
      </div>
    </div>
  );
}

function Pestanas({ vistas }: { vistas: typeof VISTAS }) {
  const { vista, setVista } = useDash();
  return (
    <nav role="tablist" aria-label="Vistas" className="scroll-x flex gap-5 border-b border-line">
      {vistas.map(({ id, texto, icono: Icono }) => (
        <button key={id} type="button" role="tab" aria-selected={vista === id} className="tab" onClick={() => setVista(id)}>
          <Icono size={15} aria-hidden /> {texto}
        </button>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------- Paleta de comandos

/** Para que "region" encuentre "Región". */
const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function Paleta({ abierta, setAbierta, subir, prefs }: { abierta: boolean; setAbierta: (v: boolean) => void; subir: () => void; prefs: Prefs }) {
  const { tabla, tablas, setVista, setMedida, setTabla, alternarFiltro, limpiarFiltros, filtros, vincular, cargarMuestra } = useDash();
  const { setTema, setDensidad } = prefs;
  const ejecutar = (f: () => void) => () => {
    f();
    setAbierta(false);
  };
  const valores = useMemo(
    () => (tabla ? tabla.categorias.filter((c) => columna(tabla, c).unicos <= 60).flatMap((c) => porCategoria(tabla, tabla.filas, c, null).map((v) => ({ col: c, valor: v.etiqueta, n: v.n }))) : []),
    [tabla],
  );
  return (
    <Command.Dialog
      open={abierta}
      onOpenChange={setAbierta}
      label="Paleta de comandos"
      overlayClassName="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]"
      contentClassName="card fixed left-1/2 top-[12vh] z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden"
    >
      <Command.Input placeholder="Busca una vista, medida, filtro o acción…" />
      <Command.List>
        <Command.Empty>Sin resultados.</Command.Empty>
        <Command.Group heading="Ir a">
          {VISTAS.map((v) => (
            <Command.Item key={v.id} value={sinTildes(`ir ${v.texto}`)} onSelect={ejecutar(() => setVista(v.id))}>
              <v.icono size={15} aria-hidden /> {v.texto}
            </Command.Item>
          ))}
        </Command.Group>
        {tabla && tabla.medidas.length > 0 && (
          <Command.Group heading="Medida de los gráficos">
            {tabla.medidas.map((m) => (
              <Command.Item key={m} value={sinTildes(`medida ${m}`)} onSelect={ejecutar(() => setMedida(m))}>
                <BarChart3 size={15} aria-hidden /> {nombreMedida(tabla, m)}
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {valores.length > 0 && (
          <Command.Group heading="Filtrar por">
            {valores.map((v) => (
              <Command.Item key={`${v.col}=${v.valor}`} value={sinTildes(`filtrar ${v.col} ${v.valor}`)} onSelect={ejecutar(() => alternarFiltro(v.col, v.valor))}>
                <Filter size={15} aria-hidden />
                <span className="flex-1">
                  <span className="text-ink-3">{v.col}:</span> {v.valor}
                </span>
                {(filtros.categorias[v.col] ?? []).includes(v.valor) ? <Check size={14} className="text-accent" /> : <span className="num text-[11px] text-ink-3">{formato(v.n)}</span>}
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {tablas.length > 1 && (
          <Command.Group heading="Tablas del archivo">
            {tablas.map((t) => (
              <Command.Item key={t.id} value={sinTildes(`tabla ${t.nombre} ${t.id}`)} onSelect={ejecutar(() => setTabla(t.id))}>
                <Database size={15} aria-hidden /> {t.nombre} <span className="num text-[11px] text-ink-3">{formato(t.filas.length)}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        <Command.Group heading="Acciones">
          <Command.Item value="subir excel archivo" onSelect={ejecutar(subir)}><Upload size={15} aria-hidden /> Subir Excel…</Command.Item>
          {puedeVincular() && <Command.Item value="vincular archivo local en vivo" onSelect={ejecutar(vincular)}><Link2 size={15} aria-hidden /> Vincular archivo local (en vivo)</Command.Item>}
          {MUESTRAS.map((m) => (
            <Command.Item key={m.ruta} value={sinTildes(`muestra ${m.descripcion}`)} onSelect={ejecutar(() => cargarMuestra(m.ruta, m.nombre))}><FileSpreadsheet size={15} aria-hidden /> Abrir muestra: {m.descripcion}</Command.Item>
          ))}
          <Command.Item value="limpiar filtros" onSelect={ejecutar(limpiarFiltros)}><X size={15} aria-hidden /> Limpiar filtros</Command.Item>
          <Command.Item value="tema claro" onSelect={ejecutar(() => setTema("light"))}><Sun size={15} aria-hidden /> Tema claro</Command.Item>
          <Command.Item value="tema oscuro" onSelect={ejecutar(() => setTema("dark"))}><Moon size={15} aria-hidden /> Tema oscuro</Command.Item>
          <Command.Item value="tema sistema" onSelect={ejecutar(() => setTema("system"))}><Monitor size={15} aria-hidden /> Tema según el sistema</Command.Item>
          <Command.Item value="densidad compacta" onSelect={ejecutar(() => setDensidad("compacto"))}><Rows3 size={15} aria-hidden /> Densidad compacta</Command.Item>
          <Command.Item value="densidad comoda" onSelect={ejecutar(() => setDensidad("comodo"))}><Rows3 size={15} aria-hidden /> Densidad cómoda</Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}

// ---------------------------------------------------------------- Página

function Contenido() {
  const { cargando, error, tabla, vista, setVista, cargarArchivo, filas } = useDash();
  const [paleta, setPaleta] = useState(false);
  const prefs = usePreferencias();
  const [arrastrando, setArrastrando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const subir = useCallback(() => input.current?.click(), []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaleta((p) => !p);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  const vistas = useMemo(
    () =>
      VISTAS.filter(({ id }) => {
        if (!tabla) return id === "lectura";
        if (!tabla.esDetalle) return ["resumen", "datos", "lectura"].includes(id);
        if (id === "tendencias") return tabla.fechas.length > 0;
        if (id === "segmentos") return tabla.categorias.length > 0;
        if (id === "riesgo") return tabla.medidas.length > 0;
        if (id === "relaciones") return tabla.medidas.length >= 2 || tabla.categorias.length >= 2;
        if (id === "explorar") return tabla.categorias.length + tabla.fechas.length > 0;
        return true;
      }),
    [tabla],
  );
  const activa = vistas.some((v) => v.id === vista) ? vista : "resumen";
  useEffect(() => {
    if (activa !== vista) setVista(activa);
  }, [activa, vista, setVista]);

  return (
    <div
      className="min-h-screen"
      onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
      onDragLeave={(e) => e.currentTarget === e.target && setArrastrando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastrando(false);
        const f = e.dataTransfer.files[0];
        if (f) cargarArchivo(f);
      }}
    >
      <input ref={input} type="file" accept=".xlsx,.xlsm,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) cargarArchivo(f); e.target.value = ""; }} />
      <BarraSuperior abrirPaleta={() => setPaleta(true)} subir={subir} prefs={prefs} />
      <main className="mx-auto flex max-w-[1440px] flex-col px-4 py-6 sm:px-6" style={{ gap: "var(--gap)" }}>
        {error && <Vacio>⚠️ {error}</Vacio>}
        {cargando && !tabla && <Esqueleto />}
        {tabla && (
          <>
            <Encabezado />
            <BarraFiltros />
            <Pestanas vistas={vistas} />
            {filas.length === 0 ? (
              <Vacio>Ningún registro coincide con los filtros.</Vacio>
            ) : (
              <div key={`${tabla.id}-${activa}`} className="fade-in flex flex-col" style={{ gap: "var(--gap)" }}>
                {activa === "resumen" && <Resumen />}
                {activa === "tendencias" && <Tendencias />}
                {activa === "segmentos" && <Segmentos />}
                {activa === "riesgo" && <Distribucion />}
                {activa === "relaciones" && <Relaciones />}
                {activa === "explorar" && <Explorador />}
                {activa === "datos" && <Datos />}
                {activa === "lectura" && <Lectura />}
              </div>
            )}
            <footer className="pt-6 text-center text-[12px] text-ink-3">
              Tus archivos se procesan solo en tu navegador · no se envían a ningún servidor · <kbd>⌘K</kbd> para buscar
            </footer>
          </>
        )}
      </main>
      <Paleta abierta={paleta} setAbierta={setPaleta} subir={subir} prefs={prefs} />
      {arrastrando && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-black/30 backdrop-blur-sm">
          <div className="card flex flex-col items-center gap-2 px-10 py-8 text-center" style={{ boxShadow: "var(--shadow-pop)" }}>
            <Upload size={28} className="text-accent" aria-hidden />
            <p className="text-[15px] font-semibold text-ink">Suelta tu Excel aquí</p>
            <p className="text-[13px] text-ink-3">Se analiza en tu navegador, sin subirlo a ningún servidor</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="flex animate-pulse flex-col" style={{ gap: "var(--gap)" }}>
      <div className="h-9 w-80 rounded-lg bg-surface-2" />
      <div className="grid grid-cols-2 xl:grid-cols-4" style={{ gap: "var(--gap)" }}>
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="card h-[132px]" />)}
      </div>
      <div className="card h-80" />
    </div>
  );
}

export default function Dashboard() {
  return (
    <ProveedorDash>
      <Contenido />
    </ProveedorDash>
  );
}
