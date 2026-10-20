"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { defaultFilter } from "cmdk";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { toast } from "sonner";
import { es } from "react-day-picker/locale";
import {
  AlertOctagon, BarChart3, Calendar as CalendarIcon, ChevronDown, Command as CmdIcon, Database, FileSpreadsheet, Filter,
  Layers, LayoutDashboard, Link2, Link2Off, Monitor, Moon, MoreHorizontal, Network, Rows3, ScanSearch, Search,
  Sparkles, Sun, Table2, TrendingUp, Upload, X,
} from "lucide-react";
import { MUESTRAS, ProveedorDash, useDash, type Vista } from "./Contexto";
import { Resumen, Tendencias, nombreMedida } from "./vistas/Resumen";
import { Distribucion, Relaciones, Segmentos } from "./vistas/Segmentos";
import { Datos, Explorador, Lectura } from "./vistas/Datos";
import { Vacio } from "./ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CommandDialog, Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut,
} from "@/components/ui/command";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { columna } from "@/lib/analisis";
import { fechaCorta, formato, porCategoria } from "@/lib/calculo";
import { cantidadFiltros, type Filtros } from "@/lib/hallazgos";
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
type Densidad = "comodo" | "compacto";

function usePreferencias() {
  const [tema, setTemaEstado] = useState<Tema>("system");
  const [densidad, setDensidadEstado] = useState<Densidad>("comodo");
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
  const setDensidad = useCallback((v: Densidad) => {
    setDensidadEstado(v);
    document.documentElement.dataset.density = v;
    try {
      localStorage.setItem("densidad", v);
    } catch {}
  }, []);
  return { tema, setTema, densidad, setDensidad };
}

/** true bajo 640 px (en el servidor, false). */
function useEsMovil() {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia("(max-width: 639px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => matchMedia("(max-width: 639px)").matches,
    () => false,
  );
}

/** Para que "region" encuentre "Región" (y "región" encuentre "Region"). */
const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Fechas del Excel: medianoche UTC ⇄ día local del calendario. */
const aLocal = (t: number) => {
  const d = new Date(t);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};
const aUTC = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());

// ---------------------------------------------------------------- Barra superior

type Prefs = ReturnType<typeof usePreferencias>;

function BarraSuperior({ abrirPaleta, subir, prefs }: { abrirPaleta: () => void; subir: () => void; prefs: Prefs }) {
  const { meta, enVivo, vincular, desvincular, cargarMuestra } = useDash();
  const { tema, setTema, densidad, setDensidad } = prefs;
  return (
    <header
      className="sticky top-0 z-30 border-b border-line"
      style={{ background: "color-mix(in srgb, var(--bg) 78%, transparent)", backdropFilter: "saturate(1.6) blur(14px)", WebkitBackdropFilter: "saturate(1.6) blur(14px)" }}
    >
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg text-white shadow-sm" style={{ background: "linear-gradient(135deg, var(--s1), var(--s7))" }}>
            <BarChart3 size={17} aria-hidden />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="text-[13px] font-semibold text-ink">Dashboard Excel</p>
            <p className="flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
              {enVivo && (
                <span className="pulse inline-block size-1.5 shrink-0 rounded-full" style={{ background: "var(--ok)" }} role="img" aria-label="En vivo" />
              )}
              <span className="truncate">{meta?.nombre ?? "Cargando…"}</span>
            </p>
          </div>
        </div>
        <div className="flex-1" />
        <Button variant="outline" onClick={abrirPaleta} className="hidden w-64 justify-between font-normal text-muted-foreground md:inline-flex" aria-label="Abrir paleta de comandos">
          <span className="inline-flex items-center gap-2">
            <Search aria-hidden /> Buscar o ir a…
          </span>
          <Kbd>⌘K</Kbd>
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" onClick={abrirPaleta} className="md:hidden" aria-label="Abrir paleta de comandos">
              <CmdIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Buscar o ir a… (⌘K)</TooltipContent>
        </Tooltip>
        <Button onClick={subir}>
          <Upload aria-hidden /> <span className="hidden sm:inline">Subir Excel</span>
          <span className="sr-only sm:hidden">Subir Excel</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Más opciones">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Archivo</DropdownMenuLabel>
              {puedeVincular() &&
                (enVivo ? (
                  <DropdownMenuItem onSelect={desvincular}>
                    <Link2Off /> Dejar de vigilar el archivo
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => void vincular()}>
                    <Link2 /> Vincular archivo local (en vivo)
                  </DropdownMenuItem>
                ))}
              {MUESTRAS.map((m) => (
                <DropdownMenuItem key={m.ruta} onSelect={() => void cargarMuestra(m.ruta, m.nombre)}>
                  <FileSpreadsheet /> Muestra: {m.descripcion}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Tema</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={tema} onValueChange={(v) => setTema(v as Tema)}>
              <DropdownMenuRadioItem value="light"><Sun /> Claro</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark"><Moon /> Oscuro</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system"><Monitor /> Según el sistema</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Densidad</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={densidad} onValueChange={(v) => setDensidad(v as Densidad)}>
              <DropdownMenuRadioItem value="comodo"><Rows3 /> Cómoda</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="compacto"><Rows3 /> Compacta</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
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
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
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
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <span aria-hidden>Tabla</span>
            <Select value={tabla.id} onValueChange={setTabla}>
              <SelectTrigger className="max-w-[260px] bg-card text-[13px] text-foreground" aria-label="Tabla">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                {tablas.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nombre} <span className="num text-[11px] text-muted-foreground">{formato(t.filas.length)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {tabla.medidas.length > 0 && tabla.esDetalle && medida && (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <span aria-hidden>Medida</span>
            <Select value={medida} onValueChange={setMedida}>
              <SelectTrigger className="max-w-[240px] bg-card text-[13px] text-foreground" aria-label="Medida para los gráficos">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="end">
                {tabla.medidas.map((m) => (
                  <SelectItem key={m} value={m}>{nombreMedida(tabla, m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
  const visibles = valores.filter((v) => sinTildes(v.etiqueta).includes(sinTildes(q)));
  return (
    <div>
      {valores.length > 8 && (
        <div className="relative mb-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar en ${col}…`} aria-label={`Buscar en ${col}`} className="h-8 pl-8 text-[12px]" />
        </div>
      )}
      <div className="max-h-48 overflow-auto" role="group" aria-label={`Valores de ${col}`}>
        {visibles.map((v) => {
          const marcado = sel.includes(v.etiqueta);
          return (
            <label key={v.etiqueta} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-[13px] text-ink-2 hover:bg-surface-hover">
              <Checkbox checked={marcado} onCheckedChange={() => alternarFiltro(col, v.etiqueta)} />
              <span className="flex-1 truncate">{v.etiqueta}</span>
              <span className="num text-[11px] text-muted-foreground">{formato(v.n)}</span>
            </label>
          );
        })}
        {visibles.length === 0 && <p className="px-1.5 py-2 text-[12px] text-muted-foreground">Sin coincidencias.</p>}
      </div>
      {sel.length > 0 && (
        <Button variant="link" size="xs" className="mt-1 px-1.5" onClick={() => setFiltro(col, [])}>Quitar selección</Button>
      )}
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
  const elegir = (desde?: Date, hasta?: Date) => {
    if (!desde) return setRango(col, null);
    const da = aUTC(desde);
    const hb = aUTC(hasta ?? desde) + 864e5 - 1;
    if (da <= min && hb >= max) setRango(col, null);
    else setRango(col, [da, hb]);
  };
  return (
    <div className="border-b border-line px-2 py-2.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-ink"><CalendarIcon size={14} className="text-muted-foreground" aria-hidden /> {col}</p>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start font-normal" aria-label={`Rango de ${col}`}>
            <CalendarIcon className="text-muted-foreground" aria-hidden />
            <span className="num">{fechaCorta(new Date(a))}</span>
            <span className="text-muted-foreground">→</span>
            <span className="num">{fechaCorta(new Date(b))}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            locale={es}
            numberOfMonths={1}
            captionLayout="dropdown"
            startMonth={aLocal(min)}
            endMonth={aLocal(max)}
            defaultMonth={aLocal(a)}
            disabled={[{ before: aLocal(min) }, { after: aLocal(max) }]}
            // Sin filtro no marcamos nada: el primer clic empieza un rango nuevo.
            selected={filtros.fechas[col] ? { from: aLocal(a), to: aLocal(b) } : undefined}
            onSelect={(r) => elegir(r?.from, r?.to)}
          />
          <div className="flex justify-between border-t border-line p-2">
            <Button variant="ghost" size="sm" onClick={() => setRango(col, null)}>Todo el período</Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function PanelFiltros() {
  const { tabla, filtros } = useDash();
  const [abierta, setAbierta] = useState<string | null>(null);
  if (!tabla) return null;
  const cats = tabla.categorias.filter((c) => columna(tabla, c).unicos <= 200);
  return (
    <div className="p-1">
      {tabla.fechas.map((c) => <RangoFechas key={c} col={c} />)}
      {cats.map((c) => {
        const n = (filtros.categorias[c] ?? []).length;
        return (
          <div key={c} className="border-b border-line last:border-0">
            <button
              type="button"
              onClick={() => setAbierta(abierta === c ? null : c)}
              className="flex w-full items-center justify-between rounded-md px-2 py-2.5 text-left text-[13px] font-medium text-ink outline-none hover:bg-surface-hover focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-expanded={abierta === c}
            >
              <span>{c}</span>
              <span className="flex items-center gap-1.5 text-[12px] font-normal text-muted-foreground">
                {n ? <Badge className="h-4.5 px-1.5 text-[11px]">{n}</Badge> : "Todos"}
                <ChevronDown size={14} className={`transition-transform ${abierta === c ? "rotate-180" : ""}`} aria-hidden />
              </span>
            </button>
            <AnimatePresence initial={false}>
              {abierta === c && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <div className="px-1 pb-2"><ListaValores col={c} /></div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

function BarraFiltros({ abierto, setAbierto }: { abierto: boolean; setAbierto: (v: boolean) => void }) {
  const { tabla, filtros, setFiltro, setRango, limpiarFiltros } = useDash();
  const movil = useEsMovil();
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
  const boton = (
    <Button variant="outline" className="bg-card">
      <Filter aria-hidden /> Filtros
      {total > 0 && <Badge className="num h-4.5 min-w-4.5 px-1 text-[11px]">{total}</Badge>}
      <ChevronDown className="text-muted-foreground" aria-hidden />
    </Button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {movil ? (
        <Sheet open={abierto} onOpenChange={setAbierto}>
          <SheetTrigger asChild>{boton}</SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] gap-0 rounded-t-2xl">
            <SheetHeader className="border-b border-line">
              <SheetTitle>Filtros</SheetTitle>
              <SheetDescription>Se aplican a todo el dashboard.</SheetDescription>
            </SheetHeader>
            <div className="overflow-auto">
              <PanelFiltros />
            </div>
            {total > 0 && (
              <div className="border-t border-line p-3">
                <Button variant="outline" className="w-full" onClick={limpiarFiltros}>Limpiar todo</Button>
              </div>
            )}
          </SheetContent>
        </Sheet>
      ) : (
        <Popover open={abierto} onOpenChange={setAbierto}>
          <PopoverTrigger asChild>{boton}</PopoverTrigger>
          <PopoverContent align="start" className="max-h-[70vh] w-[340px] overflow-auto p-1">
            <PanelFiltros />
          </PopoverContent>
        </Popover>
      )}
      <AnimatePresence initial={false}>
        {chips.map((c) => (
          <motion.span key={c.clave} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.15 }}>
            <Badge variant="secondary" className="h-7 max-w-[80vw] gap-1 rounded-full bg-accent-soft pr-1 pl-2.5 text-[12px] text-accent">
              <span className="min-w-0 truncate">{c.texto}</span>
              <button
                type="button"
                onClick={c.quitar}
                className="grid size-5 place-items-center rounded-full outline-none hover:bg-accent hover:text-white focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Quitar filtro ${c.clave}`}
              >
                <X size={12} />
              </button>
            </Badge>
          </motion.span>
        ))}
      </AnimatePresence>
      {total > 0 && (
        <Button variant="ghost" size="sm" onClick={limpiarFiltros} className="text-muted-foreground">Limpiar todo</Button>
      )}
      {total === 0 && <span className="hidden text-[12px] text-muted-foreground sm:inline">Tip: haz clic en cualquier barra para filtrar todo el dashboard.</span>}
    </div>
  );
}

// ---------------------------------------------------------------- Paleta de comandos

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
    <CommandDialog open={abierta} onOpenChange={setAbierta} className="sm:max-w-[640px]">
      <Command filter={(valor, busqueda, claves) => defaultFilter!(sinTildes(valor), sinTildes(busqueda), claves?.map(sinTildes))}>
        <CommandInput placeholder="Busca una vista, medida, filtro o acción…" />
        <CommandList className="max-h-[min(60vh,420px)]">
          <CommandEmpty>Sin resultados.</CommandEmpty>
          <CommandGroup heading="Ir a">
            {VISTAS.map((v) => (
              <CommandItem key={v.id} value={`ir ${v.texto}`} onSelect={ejecutar(() => setVista(v.id))}>
                <v.icono aria-hidden /> {v.texto}
              </CommandItem>
            ))}
          </CommandGroup>
          {tabla && tabla.medidas.length > 0 && (
            <CommandGroup heading="Medida de los gráficos">
              {tabla.medidas.map((m) => (
                <CommandItem key={m} value={`medida ${m}`} onSelect={ejecutar(() => setMedida(m))}>
                  <BarChart3 aria-hidden /> {nombreMedida(tabla, m)}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {valores.length > 0 && (
            <CommandGroup heading="Filtrar por">
              {valores.map((v) => {
                const activo = (filtros.categorias[v.col] ?? []).includes(v.valor);
                return (
                  <CommandItem
                    key={`${v.col}=${v.valor}`}
                    value={`filtrar ${v.col} ${v.valor}`}
                    data-checked={activo}
                    onSelect={ejecutar(() => alternarFiltro(v.col, v.valor))}
                  >
                    <Filter aria-hidden />
                    <span className="flex-1 truncate">
                      <span className="text-muted-foreground">{v.col}:</span> {v.valor}
                    </span>
                    {!activo && <CommandShortcut className="num tracking-normal">{formato(v.n)}</CommandShortcut>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
          {tablas.length > 1 && (
            <CommandGroup heading="Tablas del archivo">
              {tablas.map((t) => (
                <CommandItem key={t.id} value={`tabla ${t.nombre} ${t.id}`} onSelect={ejecutar(() => setTabla(t.id))}>
                  <Database aria-hidden /> {t.nombre}
                  <CommandShortcut className="num tracking-normal">{formato(t.filas.length)}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading="Acciones">
            <CommandItem value="subir excel archivo" onSelect={ejecutar(subir)}><Upload aria-hidden /> Subir Excel…</CommandItem>
            {puedeVincular() && <CommandItem value="vincular archivo local en vivo" onSelect={ejecutar(() => void vincular())}><Link2 aria-hidden /> Vincular archivo local (en vivo)</CommandItem>}
            {MUESTRAS.map((m) => (
              <CommandItem key={m.ruta} value={`muestra ${m.descripcion}`} onSelect={ejecutar(() => void cargarMuestra(m.ruta, m.nombre))}><FileSpreadsheet aria-hidden /> Abrir muestra: {m.descripcion}</CommandItem>
            ))}
            <CommandItem value="limpiar filtros" onSelect={ejecutar(limpiarFiltros)}><X aria-hidden /> Limpiar filtros</CommandItem>
            <CommandItem value="tema claro" onSelect={ejecutar(() => setTema("light"))}><Sun aria-hidden /> Tema claro</CommandItem>
            <CommandItem value="tema oscuro" onSelect={ejecutar(() => setTema("dark"))}><Moon aria-hidden /> Tema oscuro</CommandItem>
            <CommandItem value="tema sistema" onSelect={ejecutar(() => setTema("system"))}><Monitor aria-hidden /> Tema según el sistema</CommandItem>
            <CommandItem value="densidad compacta" onSelect={ejecutar(() => setDensidad("compacto"))}><Rows3 aria-hidden /> Densidad compacta</CommandItem>
            <CommandItem value="densidad comoda" onSelect={ejecutar(() => setDensidad("comodo"))}><Rows3 aria-hidden /> Densidad cómoda</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

// ---------------------------------------------------------------- Avisos

/** Primer valor que está en `ahora` y no estaba en `antes`. */
function filtroNuevo(antes: Filtros, ahora: Filtros): { col: string; valor: string } | null {
  for (const [col, vals] of Object.entries(ahora.categorias)) {
    const previos = antes.categorias[col] ?? [];
    const valor = vals.find((v) => !previos.includes(v));
    if (valor !== undefined) return { col, valor };
  }
  return null;
}

/** "Archivo actualizado" al recargar un archivo vinculado y "Filtro aplicado" al filtrar desde un gráfico o ⌘K. */
function useAvisos(silenciarFiltros: boolean) {
  const { meta, filtros, tabla, alternarFiltro } = useDash();
  const metaPrevia = useRef(meta);
  useEffect(() => {
    const antes = metaPrevia.current;
    metaPrevia.current = meta;
    if (meta?.origen === "vinculado" && antes?.origen === "vinculado" && antes.nombre === meta.nombre && antes.modificado !== meta.modificado) {
      toast.success("Archivo actualizado", { description: `${meta.nombre} cambió en disco; el dashboard se recargó con los datos nuevos.` });
    }
  }, [meta]);

  const filtrosPrevios = useRef(filtros);
  const tablaPrevia = useRef(tabla?.id);
  useEffect(() => {
    const antes = filtrosPrevios.current;
    filtrosPrevios.current = filtros;
    const mismaTabla = tablaPrevia.current === tabla?.id;
    tablaPrevia.current = tabla?.id;
    if (!mismaTabla || silenciarFiltros) return;
    const nuevo = filtroNuevo(antes, filtros);
    if (nuevo) {
      toast(`Filtro aplicado: ${nuevo.valor}`, {
        description: `Todo el dashboard muestra solo ${nuevo.col} = ${nuevo.valor}.`,
        icon: <Filter className="size-4" />,
        action: { label: "Deshacer", onClick: () => alternarFiltro(nuevo.col, nuevo.valor) },
      });
    }
  }, [filtros, tabla?.id, silenciarFiltros, alternarFiltro]);
}

// ---------------------------------------------------------------- Página

function Pestanas({ vistas, activa }: { vistas: typeof VISTAS; activa: Vista }) {
  return (
    <TabsList variant="line" aria-label="Vistas" className="scroll-x h-auto w-full justify-start gap-5 group-data-horizontal/tabs:h-auto rounded-none border-b border-line p-0">
      {vistas.map(({ id, texto, icono: Icono }) => (
        <TabsTrigger
          key={id}
          value={id}
          className="h-10 flex-none rounded-md border-0 px-1 text-[13px] focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none text-muted-foreground after:hidden hover:text-foreground data-active:text-foreground dark:data-active:border-transparent"
        >
          <Icono aria-hidden /> {texto}
          {activa === id && (
            <motion.span layoutId="indicador-pestana" className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-accent" transition={{ type: "spring", stiffness: 500, damping: 38 }} aria-hidden />
          )}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}

function Contenido() {
  const { cargando, error, tabla, vista, setVista, cargarArchivo, filas } = useDash();
  const [paleta, setPaleta] = useState(false);
  const prefs = usePreferencias();
  const [arrastrando, setArrastrando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const subir = useCallback(() => input.current?.click(), []);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  // Dentro del panel de filtros cada clic ya se ve; el aviso es para filtros aplicados desde gráficos o ⌘K.
  useAvisos(filtrosAbiertos);

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
        {error && (
          <div role="alert" className="flex items-start gap-2.5 rounded-xl border p-4 text-[13px]" style={{ background: "var(--critical-soft)", color: "var(--critical-text)", borderColor: "color-mix(in srgb, var(--critical) 30%, transparent)" }}>
            <AlertOctagon size={16} className="mt-0.5 shrink-0" aria-hidden />
            <p><strong className="font-semibold">No se pudo leer el archivo.</strong> {error}</p>
          </div>
        )}
        {cargando && !tabla && <Esqueleto />}
        {tabla && (
          <>
            <Encabezado />
            <BarraFiltros abierto={filtrosAbiertos} setAbierto={setFiltrosAbiertos} />
            <Tabs value={activa} onValueChange={(v) => setVista(v as Vista)} className="gap-[var(--gap)]">
              <Pestanas vistas={vistas} activa={activa} />
              <TabsContent value={activa}>
                {filas.length === 0 ? (
                  <Vacio>Ningún registro coincide con los filtros.</Vacio>
                ) : (
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={`${tabla.id}-${activa}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                      className="flex flex-col"
                      style={{ gap: "var(--gap)" }}
                    >
                      {activa === "resumen" && <Resumen />}
                      {activa === "tendencias" && <Tendencias />}
                      {activa === "segmentos" && <Segmentos />}
                      {activa === "riesgo" && <Distribucion />}
                      {activa === "relaciones" && <Relaciones />}
                      {activa === "explorar" && <Explorador />}
                      {activa === "datos" && <Datos />}
                      {activa === "lectura" && <Lectura />}
                    </motion.div>
                  </AnimatePresence>
                )}
              </TabsContent>
            </Tabs>
            <footer className="pt-6 text-center text-[12px] text-muted-foreground">
              Tus archivos se procesan solo en tu navegador · no se envían a ningún servidor · <Kbd>⌘K</Kbd> para buscar
            </footer>
          </>
        )}
      </main>
      <Paleta abierta={paleta} setAbierta={setPaleta} subir={subir} prefs={prefs} />
      <Toaster theme={prefs.tema} position="bottom-right" richColors={false} closeButton />
      <AnimatePresence>
        {arrastrando && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-black/30 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.96 }}
              animate={{ scale: 1 }}
              className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-accent bg-card px-10 py-8 text-center"
              style={{ boxShadow: "var(--shadow-pop)" }}
            >
              <Upload size={28} className="text-accent" aria-hidden />
              <p className="text-[15px] font-semibold text-ink">Suelta tu Excel aquí</p>
              <p className="text-[13px] text-muted-foreground">Se analiza en tu navegador, sin subirlo a ningún servidor</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="flex flex-col" style={{ gap: "var(--gap)" }} aria-busy="true" aria-label="Cargando el dashboard">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-80 max-w-full" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <Skeleton className="h-8 w-28" />
      <div className="flex gap-5 border-b border-line pb-3">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-4 w-20" />)}
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4" style={{ gap: "var(--gap)" }}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex h-[132px] flex-col justify-between rounded-xl border border-line bg-card" style={{ padding: "var(--pad)" }}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-6 w-full" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: "var(--gap)" }}>
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={300}>
        <ProveedorDash>
          <Contenido />
        </ProveedorDash>
      </TooltipProvider>
    </MotionConfig>
  );
}
