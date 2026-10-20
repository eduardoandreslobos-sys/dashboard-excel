"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Check, ChevronRight, Command as CmdIcon, Copy, Eye, Globe2, Loader2, MoreHorizontal, Pencil, Save, Search, Share2, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { useDash } from "@/components/Contexto";
import { duplicarDashboard, guardarVista } from "@/lib/servidor/dashboards";
import type { Visibilidad } from "@/lib/tipos";
import { Compartir } from "./Compartir";
import { useNube } from "./contexto-nube";
import { MenuUsuario } from "./MenuUsuario";

interface Prefs {
  tema: string;
  setTema: (t: "light" | "dark" | "system") => void;
  densidad: string;
  setDensidad: (d: "comodo" | "compacto") => void;
}

const vidrio = {
  background: "color-mix(in srgb, var(--bg) 78%, transparent)",
  backdropFilter: "saturate(1.6) blur(14px)",
  WebkitBackdropFilter: "saturate(1.6) blur(14px)",
} as const;

/** Barra superior de un dashboard guardado: ruta, estado de guardado, compartir y cuenta. */
export function BarraNube({ abrirPaleta, subir, prefs }: { abrirPaleta: () => void; subir: () => void; prefs: Prefs }) {
  const nube = useNube()!;
  const { config, sinGuardar, marcarGuardado, soloLectura } = useDash();
  const { dashboard, usuario } = nube;
  const router = useRouter();
  const [compartirAbierto, setCompartirAbierto] = useState(false);
  const [estado, setEstado] = useState<{ visibilidad: Visibilidad; enlace: string | null }>({ visibilidad: dashboard.visibilidad, enlace: dashboard.enlace });
  const [guardando, iniciar] = useTransition();
  const esDueno = dashboard.acceso === "dueno";

  const guardar = useCallback(() => {
    if (soloLectura || !usuario) return;
    iniciar(async () => {
      const r = await guardarVista(dashboard.id, config);
      if (!r.ok) return void toast.error(r.error);
      marcarGuardado();
      toast.success("Vista guardada", { description: "Quien abra este dashboard verá estos filtros, medida y pestaña." });
    });
  }, [config, dashboard.id, marcarGuardado, soloLectura, usuario]);

  // ⌘S / Ctrl+S guarda la vista.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (sinGuardar) guardar();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [guardar, sinGuardar]);

  // Aviso del navegador si se cierra con cambios sin guardar.
  useEffect(() => {
    if (!sinGuardar) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sinGuardar]);

  const duplicar = () =>
    iniciar(async () => {
      const r = await duplicarDashboard(dashboard.id);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.mensaje ?? "Copia creada");
      router.push(`/d/${r.datos!.id}`);
    });

  const insignia = soloLectura
    ? { icono: Eye, texto: "Solo lectura" }
    : esDueno
      ? null
      : { icono: Pencil, texto: "Puedes editar" };

  return (
    <header className="sticky top-0 z-30 border-b border-line" style={vidrio}>
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Link href={usuario ? "/dashboards" : "/"} className="grid size-8 shrink-0 place-items-center rounded-lg text-white shadow-sm" style={{ background: "linear-gradient(135deg, var(--s1), var(--s7))" }} aria-label="Ir a Mi espacio">
          <BarChart3 size={17} aria-hidden />
        </Link>
        <nav aria-label="Ruta" className="flex min-w-0 items-center gap-1 text-[13px]">
          {usuario && (
            <>
              <Link href="/dashboards" className="hidden shrink-0 text-muted-foreground hover:text-foreground sm:inline">Mi espacio</Link>
              <ChevronRight size={14} className="hidden shrink-0 text-muted-foreground sm:inline" aria-hidden />
            </>
          )}
          <span className="truncate font-semibold text-ink">{dashboard.titulo}</span>
        </nav>
        {insignia && (
          <Badge variant="secondary" className="hidden shrink-0 gap-1 md:inline-flex"><insignia.icono size={12} /> {insignia.texto}</Badge>
        )}
        {esDueno && estado.visibilidad === "plataforma" && (
          <Badge variant="secondary" className="hidden shrink-0 gap-1 lg:inline-flex"><Users size={12} /> Publicado</Badge>
        )}
        {esDueno && estado.enlace && (
          <Badge variant="secondary" className="hidden shrink-0 gap-1 lg:inline-flex"><Globe2 size={12} /> Enlace público</Badge>
        )}
        <div className="flex-1" />

        <Button variant="outline" onClick={abrirPaleta} className="hidden w-52 justify-between font-normal text-muted-foreground xl:inline-flex" aria-label="Abrir paleta de comandos">
          <span className="inline-flex items-center gap-2"><Search aria-hidden /> Buscar…</span>
          <Kbd>⌘K</Kbd>
        </Button>
        <Button variant="outline" size="icon" onClick={abrirPaleta} className="xl:hidden" aria-label="Abrir paleta de comandos"><CmdIcon /></Button>

        {usuario && !soloLectura && (
          sinGuardar || guardando ? (
            <Button onClick={guardar} disabled={guardando} variant="outline" aria-keyshortcuts="Meta+S">
              {guardando ? <Loader2 className="animate-spin" /> : <Save />}
              <span className="hidden sm:inline">Guardar vista</span>
            </Button>
          ) : (
            <span className="hidden items-center gap-1 text-[12px] text-muted-foreground sm:inline-flex" role="status"><Check size={13} /> Guardado</span>
          )
        )}
        {esDueno && (
          <Button onClick={() => setCompartirAbierto(true)}>
            <Share2 /> <span className="hidden sm:inline">Compartir</span>
          </Button>
        )}
        {!usuario && (
          <Button asChild><Link href="/registro">Crear cuenta gratis</Link></Button>
        )}
        {usuario && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Más acciones"><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {!soloLectura && <DropdownMenuItem onSelect={subir}><Upload /> Reemplazar Excel…</DropdownMenuItem>}
              <DropdownMenuItem onSelect={duplicar}><Copy /> Duplicar en mi espacio</DropdownMenuItem>
              {esDueno && <DropdownMenuSeparator />}
              {esDueno && <DropdownMenuItem onSelect={() => setCompartirAbierto(true)}><Share2 /> Compartir y publicar…</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {usuario && <MenuUsuario usuario={usuario} prefs={prefs} />}
      </div>
      {esDueno && <Compartir dashboardId={dashboard.id} abierto={compartirAbierto} setAbierto={setCompartirAbierto} alCambiar={setEstado} />}
    </header>
  );
}
