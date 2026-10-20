"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3, Copy, Eye, FileSpreadsheet, Globe2, LayoutGrid, Loader2, MoreHorizontal, Pencil, Plus, Search, Share2,
  Trash2, Upload, Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { MUESTRAS } from "@/components/Contexto";
import { subirExcel } from "@/lib/nube";
import { crearDashboard, duplicarDashboard, eliminarDashboard, renombrarDashboard } from "@/lib/servidor/dashboards";
import type { Espacio, Tarjeta } from "@/lib/servidor/espacio";
import { fechaCorta } from "@/lib/calculo";
import type { UsuarioSesion } from "./contexto-nube";
import { MenuUsuario } from "./MenuUsuario";
import { Compartir } from "./Compartir";

const tamano = (b: number | null) => (!b ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);
const tituloDesde = (nombre: string) => nombre.replace(/\.(xlsx|xlsm|xls)$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 120) || "Nuevo dashboard";

type Pestana = "mios" | "compartidos" | "publicados";

export function EspacioCliente({ usuario, espacio }: { usuario: UsuarioSesion; espacio: Espacio }) {
  const [pestana, setPestana] = useState<Pestana>("mios");
  const [busqueda, setBusqueda] = useState("");
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const filtrar = (lista: Tarjeta[]) => {
    const q = busqueda.trim().toLowerCase();
    return q ? lista.filter((t) => `${t.titulo} ${t.descripcion} ${t.dueno?.nombre ?? ""} ${t.archivo ?? ""}`.toLowerCase().includes(q)) : lista;
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line" style={{ background: "color-mix(in srgb, var(--bg) 78%, transparent)", backdropFilter: "saturate(1.6) blur(14px)" }}>
        <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-4 sm:px-6">
          <Link href="/dashboards" className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg text-white shadow-sm" style={{ background: "linear-gradient(135deg, var(--s1), var(--s7))" }}>
              <BarChart3 size={17} aria-hidden />
            </span>
            <span className="text-[13px] font-semibold">Dashboard Excel</span>
          </Link>
          <div className="flex-1" />
          <Button onClick={() => setNuevoAbierto(true)}><Plus /> <span className="hidden sm:inline">Nuevo dashboard</span></Button>
          <MenuUsuario usuario={usuario} />
        </div>
      </header>

      <main className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight">Mi espacio</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">Hola, {usuario.nombre || usuario.email}. Tus dashboards son privados hasta que decides compartirlos.</p>
          </div>
          <label className="relative w-full max-w-xs">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar dashboards…" className="pl-8" aria-label="Buscar dashboards" />
          </label>
        </div>

        <Tabs value={pestana} onValueChange={(v) => setPestana(v as Pestana)} className="gap-5">
          <TabsList variant="line">
            <TabsTrigger value="mios"><LayoutGrid /> Mis dashboards <Contador n={espacio.mios.length} /></TabsTrigger>
            <TabsTrigger value="compartidos"><Share2 /> Compartidos conmigo <Contador n={espacio.compartidos.length} /></TabsTrigger>
            <TabsTrigger value="publicados"><Users /> Publicados <Contador n={espacio.publicados.length} /></TabsTrigger>
          </TabsList>
          <TabsContent value="mios">
            <Grilla tarjetas={filtrar(espacio.mios)} vacio={
              <Vacio icono={FileSpreadsheet} titulo="Todavía no tienes dashboards" texto="Sube un Excel y obtén un dashboard automático en segundos.">
                <Button onClick={() => setNuevoAbierto(true)}><Plus /> Crear mi primer dashboard</Button>
              </Vacio>
            } />
          </TabsContent>
          <TabsContent value="compartidos">
            <Grilla tarjetas={filtrar(espacio.compartidos)} vacio={<Vacio icono={Share2} titulo="Nadie te ha compartido dashboards" texto="Cuando alguien te dé acceso de lectura o edición, aparecerá aquí." />} />
          </TabsContent>
          <TabsContent value="publicados">
            <Grilla tarjetas={filtrar(espacio.publicados)} vacio={<Vacio icono={Users} titulo="No hay dashboards publicados" texto="Los dashboards que otras personas publiquen en la plataforma aparecerán aquí." />} />
          </TabsContent>
        </Tabs>
      </main>
      <NuevoDashboard abierto={nuevoAbierto} setAbierto={setNuevoAbierto} />
      <Toaster position="bottom-right" closeButton />
    </div>
  );
}

function Contador({ n }: { n: number }) {
  return <span className="num rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{n}</span>;
}

function Vacio({ icono: Icono, titulo, texto, children }: { icono: typeof Users; titulo: string; texto: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"><Icono size={22} aria-hidden /></span>
      <h2 className="text-[16px] font-semibold">{titulo}</h2>
      <p className="max-w-sm text-[13px] text-muted-foreground">{texto}</p>
      {children}
    </div>
  );
}

function Grilla({ tarjetas, vacio }: { tarjetas: Tarjeta[]; vacio: React.ReactNode }) {
  if (!tarjetas.length) return <>{vacio}</>;
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {tarjetas.map((t) => <TarjetaDashboard key={t.id} t={t} />)}
    </ul>
  );
}

function TarjetaDashboard({ t }: { t: Tarjeta }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [renombrar, setRenombrar] = useState(false);
  const [eliminar, setEliminar] = useState(false);
  const [compartir, setCompartir] = useState(false);
  const esDueno = t.acceso === "dueno";

  const duplicar = () => iniciar(async () => {
    const r = await duplicarDashboard(t.id);
    if (!r.ok) return void toast.error(r.error);
    toast.success(r.mensaje ?? "Copia creada");
    router.refresh();
  });

  return (
    <li className="group relative flex flex-col rounded-xl border border-line bg-card p-5 transition-shadow hover:shadow-[var(--shadow-pop)]">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><BarChart3 size={18} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold">
            <Link href={`/d/${t.id}`} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">{t.titulo}</Link>
          </h3>
          <p className="truncate text-[12px] text-muted-foreground">{esDueno ? "Tuyo" : `De ${t.dueno?.nombre || t.dueno?.email || "otra persona"}`} · {fechaCorta(new Date(t.actualizado))}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative z-10 -mr-2 -mt-1" aria-label={`Acciones de ${t.titulo}`} disabled={pendiente}>
              {pendiente ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild><Link href={`/d/${t.id}`}><Eye /> Abrir</Link></DropdownMenuItem>
            {t.acceso !== "lector" && <DropdownMenuItem onSelect={() => setRenombrar(true)}><Pencil /> Renombrar</DropdownMenuItem>}
            <DropdownMenuItem onSelect={duplicar}><Copy /> Duplicar en mi espacio</DropdownMenuItem>
            {esDueno && <DropdownMenuItem onSelect={() => setCompartir(true)}><Share2 /> Compartir y publicar…</DropdownMenuItem>}
            {esDueno && <DropdownMenuSeparator />}
            {esDueno && <DropdownMenuItem variant="destructive" onSelect={() => setEliminar(true)}><Trash2 /> Eliminar</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {t.descripcion && <p className="mt-3 line-clamp-2 text-[13px] text-muted-foreground">{t.descripcion}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {t.acceso === "editor" && <Badge variant="secondary" className="gap-1"><Pencil size={11} /> Puedes editar</Badge>}
        {t.acceso === "lector" && <Badge variant="secondary" className="gap-1"><Eye size={11} /> Solo lectura</Badge>}
        {t.publicado && <Badge variant="secondary" className="gap-1"><Users size={11} /> Publicado</Badge>}
        {esDueno && t.enlacePublico && <Badge variant="secondary" className="gap-1"><Globe2 size={11} /> Enlace público</Badge>}
        {esDueno && t.compartidoCon > 0 && <Badge variant="secondary" className="gap-1"><Share2 size={11} /> {t.compartidoCon} {t.compartidoCon === 1 ? "persona" : "personas"}</Badge>}
        {t.archivo && <span className="ml-auto flex min-w-0 items-center gap-1 truncate text-[11px] text-muted-foreground"><FileSpreadsheet size={12} className="shrink-0" /> <span className="truncate">{t.archivo}</span> {tamano(t.tamano)}</span>}
      </div>
      <Renombrar t={t} abierto={renombrar} setAbierto={setRenombrar} />
      <Eliminar t={t} abierto={eliminar} setAbierto={setEliminar} />
      {esDueno && <Compartir dashboardId={t.id} abierto={compartir} setAbierto={(v) => { setCompartir(v); if (!v) router.refresh(); }} />}
    </li>
  );
}

function Renombrar({ t, abierto, setAbierto }: { t: Tarjeta; abierto: boolean; setAbierto: (v: boolean) => void }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const enviar = (form: FormData) => iniciar(async () => {
    const r = await renombrarDashboard(t.id, String(form.get("titulo") ?? ""), String(form.get("descripcion") ?? ""));
    if (!r.ok) return void toast.error(r.error);
    toast.success("Cambios guardados");
    setAbierto(false);
    router.refresh();
  });
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogContent>
        <form action={enviar} className="flex flex-col gap-4">
          <DialogHeader><DialogTitle>Renombrar dashboard</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-1.5"><Label htmlFor={`t-${t.id}`}>Título</Label><Input id={`t-${t.id}`} name="titulo" defaultValue={t.titulo} maxLength={120} required /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor={`d-${t.id}`}>Descripción (opcional)</Label><Textarea id={`d-${t.id}`} name="descripcion" defaultValue={t.descripcion} maxLength={500} rows={3} /></div>
          <DialogFooter><Button type="submit" disabled={pendiente}>{pendiente && <Loader2 className="animate-spin" />} Guardar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Eliminar({ t, abierto, setAbierto }: { t: Tarjeta; abierto: boolean; setAbierto: (v: boolean) => void }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const confirmar = () => iniciar(async () => {
    const r = await eliminarDashboard(t.id);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Dashboard eliminado");
    setAbierto(false);
    router.refresh();
  });
  return (
    <AlertDialog open={abierto} onOpenChange={setAbierto}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar «{t.titulo}»?</AlertDialogTitle>
          <AlertDialogDescription>Se borran el dashboard, su Excel y los accesos compartidos. Esta acción no se puede deshacer.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendiente}>Cancelar</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={(e) => { e.preventDefault(); confirmar(); }} disabled={pendiente}>
            {pendiente && <Loader2 className="animate-spin" />} Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Crear: elegir Excel (o plantilla) → registro en la base → subida directa a Storage → abrir. */
function NuevoDashboard({ abierto, setAbierto }: { abierto: boolean; setAbierto: (v: boolean) => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [paso, setPaso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const plantillas = useMemo(() => MUESTRAS, []);

  const elegir = (f: File | undefined) => {
    if (!f) return;
    if (!/\.(xlsx|xlsm|xls)$/i.test(f.name)) return setError("Solo se aceptan archivos Excel (.xlsx, .xlsm, .xls).");
    setError(null);
    setArchivo(f);
    if (!titulo) setTitulo(tituloDesde(f.name));
  };

  const usarPlantilla = async (ruta: string, nombre: string) => {
    setPaso("Cargando plantilla…");
    const blob = await (await fetch(ruta)).blob();
    setPaso(null);
    elegir(new File([blob], nombre, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  };

  const crear = async () => {
    if (!archivo) return;
    setError(null);
    setPaso("Creando dashboard…");
    const r = await crearDashboard({ titulo: titulo || tituloDesde(archivo.name), archivoNombre: archivo.name, archivoTamano: archivo.size });
    if (!r.ok) {
      setPaso(null);
      return setError(r.error);
    }
    try {
      setPaso("Subiendo Excel…");
      await subirExcel(r.datos!.path, archivo);
    } catch (e) {
      await eliminarDashboard(r.datos!.id);
      setPaso(null);
      return setError(e instanceof Error ? e.message : "No pude subir el archivo.");
    }
    setPaso("Abriendo…");
    router.push(`/d/${r.datos!.id}`);
  };

  const cerrar = (v: boolean) => {
    if (paso) return;
    setAbierto(v);
    if (!v) { setArchivo(null); setTitulo(""); setError(null); }
  };

  return (
    <Dialog open={abierto} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Nuevo dashboard</DialogTitle>
          <DialogDescription>Sube un Excel: detectamos sus tablas y armamos los gráficos. Queda privado en tu espacio.</DialogDescription>
        </DialogHeader>
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); elegir(e.dataTransfer.files[0]); }}
          className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${arrastrando ? "border-accent bg-accent-soft" : "border-line hover:bg-muted/50"}`}
        >
          {archivo ? <FileSpreadsheet size={26} className="text-accent" aria-hidden /> : <Upload size={26} className="text-muted-foreground" aria-hidden />}
          <span className="text-[14px] font-medium">{archivo ? archivo.name : "Arrastra tu Excel o haz clic para elegirlo"}</span>
          <span className="text-[12px] text-muted-foreground">{archivo ? tamano(archivo.size) : ".xlsx, .xlsm o .xls · hasta 50 MB"}</span>
        </button>
        <input ref={input} type="file" accept=".xlsx,.xlsm,.xls" hidden onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = ""; }} />
        {!archivo && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[12px] text-muted-foreground">O parte de una plantilla:</p>
            <div className="flex flex-wrap gap-2">
              {plantillas.map((m) => (
                <Button key={m.ruta} variant="outline" size="sm" onClick={() => void usarPlantilla(m.ruta, m.nombre)} disabled={Boolean(paso)}><FileSpreadsheet /> {m.descripcion}</Button>
              ))}
            </div>
          </div>
        )}
        {archivo && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nuevo-titulo">Título</Label>
            <Input id="nuevo-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} />
          </div>
        )}
        {error && <p role="alert" className="text-[13px]" style={{ color: "var(--critical-text)" }}>{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => cerrar(false)} disabled={Boolean(paso)}>Cancelar</Button>
          <Button onClick={() => void crear()} disabled={!archivo || Boolean(paso)}>
            {paso ? <><Loader2 className="animate-spin" /> {paso}</> : <><Plus /> Crear dashboard</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
