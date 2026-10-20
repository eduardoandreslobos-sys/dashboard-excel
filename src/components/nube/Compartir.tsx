"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Check, Copy, Globe2, Link2, Loader2, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  cambiarVisibilidad,
  compartir,
  crearEnlacePublico,
  listarAccesos,
  quitarAcceso,
  revocarEnlacePublico,
  type Acceso,
} from "@/lib/servidor/dashboards";
import type { NivelPermiso, Visibilidad } from "@/lib/tipos";
import { iniciales } from "./MenuUsuario";

const NIVELES: { valor: NivelPermiso; texto: string }[] = [
  { valor: "lector", texto: "Puede ver" },
  { valor: "editor", texto: "Puede editar" },
];

/** Diálogo del dueño: personas con acceso, publicación en la plataforma y enlace público. */
export function Compartir({
  dashboardId,
  abierto,
  setAbierto,
  alCambiar,
}: {
  dashboardId: string;
  abierto: boolean;
  setAbierto: (v: boolean) => void;
  alCambiar?: (estado: { visibilidad: Visibilidad; enlace: string | null }) => void;
}) {
  const [accesos, setAccesos] = useState<Acceso[] | null>(null);
  const [visibilidad, setVisibilidad] = useState<Visibilidad>("privado");
  const [enlace, setEnlace] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [nivel, setNivel] = useState<NivelPermiso>("lector");
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pendiente, iniciar] = useTransition();

  const cargar = useCallback(async () => {
    const r = await listarAccesos(dashboardId);
    if (!r.ok) return setError(r.error);
    setAccesos(r.datos!.accesos);
    setVisibilidad(r.datos!.visibilidad);
    setEnlace(r.datos!.enlace);
  }, [dashboardId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (abierto) void cargar();
  }, [abierto, cargar]);

  const urlPublica = enlace ? `${typeof window === "undefined" ? "" : window.location.origin}/p/${enlace}` : "";

  const ejecutar = (accion: () => Promise<{ ok: boolean; error?: string; mensaje?: string }>, tras?: () => void) =>
    iniciar(async () => {
      setError(null);
      const r = await accion();
      if (!r.ok) return setError(r.error ?? "No se pudo completar.");
      if (r.mensaje) toast.success(r.mensaje);
      tras?.();
      await cargar();
    });

  const invitar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    ejecutar(() => compartir(dashboardId, email, nivel), () => setEmail(""));
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(urlPublica);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      toast.error("No pude copiar. Selecciona el enlace y cópialo a mano.");
    }
  };

  useEffect(() => {
    alCambiar?.({ visibilidad, enlace });
  }, [visibilidad, enlace, alCambiar]);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Compartir dashboard</DialogTitle>
          <DialogDescription>Decide quién puede verlo o editarlo. Solo tú, como dueño, ves esta configuración.</DialogDescription>
        </DialogHeader>

        <form onSubmit={invitar} className="flex flex-col gap-2">
          <Label htmlFor="compartir-email">Invitar a una persona de la plataforma</Label>
          <div className="flex gap-2">
            <Input id="compartir-email" type="email" placeholder="correo@empresa.cl" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1" autoComplete="off" />
            <Select value={nivel} onValueChange={(v) => setNivel(v as NivelPermiso)}>
              <SelectTrigger className="w-[140px]" aria-label="Nivel de acceso"><SelectValue /></SelectTrigger>
              <SelectContent>{NIVELES.map((n) => <SelectItem key={n.valor} value={n.valor}>{n.texto}</SelectItem>)}</SelectContent>
            </Select>
            <Button type="submit" disabled={pendiente || !email.trim()}>
              {pendiente ? <Loader2 className="animate-spin" /> : <UserPlus />} Invitar
            </Button>
          </div>
          {error && <p role="alert" className="text-[12px]" style={{ color: "var(--critical-text)" }}>{error}</p>}
        </form>

        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground"><Users size={13} /> Personas con acceso</p>
          {accesos === null ? (
            <p className="py-3 text-[13px] text-muted-foreground">Cargando…</p>
          ) : accesos.length === 0 ? (
            <p className="py-3 text-[13px] text-muted-foreground">Todavía no lo compartes con nadie.</p>
          ) : (
            <ul className="flex max-h-56 flex-col overflow-auto">
              {accesos.map((a) => (
                <li key={a.usuario.id} className="flex items-center gap-3 py-2">
                  <Avatar className="size-8"><AvatarFallback className="text-[11px]">{iniciales(a.usuario.nombre, a.usuario.email)}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{a.usuario.nombre || a.usuario.email}</p>
                    <p className="truncate text-[12px] text-muted-foreground">{a.usuario.email}</p>
                  </div>
                  <Select value={a.nivel} onValueChange={(v) => ejecutar(() => compartir(dashboardId, a.usuario.email, v as NivelPermiso))}>
                    <SelectTrigger size="sm" className="w-[130px]" aria-label={`Acceso de ${a.usuario.nombre}`}><SelectValue /></SelectTrigger>
                    <SelectContent>{NIVELES.map((n) => <SelectItem key={n.valor} value={n.valor}>{n.texto}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" aria-label={`Quitar acceso a ${a.usuario.nombre || a.usuario.email}`} onClick={() => ejecutar(() => quitarAcceso(dashboardId, a.usuario.id))}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Separator />

        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="sw-plataforma" className="flex items-center gap-1.5"><Users size={14} /> Publicar en la plataforma</Label>
              <p className="mt-0.5 text-[12px] text-muted-foreground">Cualquier persona con cuenta lo verá en «Publicados» (solo lectura).</p>
            </div>
            <Switch id="sw-plataforma" checked={visibilidad === "plataforma"} disabled={pendiente}
              onCheckedChange={(v) => ejecutar(() => cambiarVisibilidad(dashboardId, v ? "plataforma" : "privado"))} />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="sw-enlace" className="flex items-center gap-1.5"><Globe2 size={14} /> Enlace público</Label>
              <p className="mt-0.5 text-[12px] text-muted-foreground">Cualquiera con el enlace podrá verlo sin iniciar sesión. Puedes revocarlo cuando quieras.</p>
            </div>
            <Switch id="sw-enlace" checked={Boolean(enlace)} disabled={pendiente}
              onCheckedChange={(v) => ejecutar(() => (v ? crearEnlacePublico(dashboardId) : revocarEnlacePublico(dashboardId)))} />
          </div>
          {enlace && (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
                <Input readOnly value={urlPublica} onFocus={(e) => e.currentTarget.select()} className="pl-8 font-mono text-[12px]" aria-label="Enlace público" />
              </div>
              <Button variant="outline" onClick={copiar}>{copiado ? <Check /> : <Copy />} {copiado ? "Copiado" : "Copiar"}</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
