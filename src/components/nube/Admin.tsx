"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, ArrowLeft, Ban, CheckCircle2, Globe2, LayoutGrid, Loader2, MoreHorizontal, Search, Share2, Shield, Trash2,
  UserCheck, Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cambiarEstado, cambiarRol, eliminarUsuario, quitarPublicacion } from "@/lib/servidor/admin";
import type { DatosAdmin, FilaUsuario } from "@/lib/servidor/admin-datos";
import { fechaCorta, formato } from "@/lib/calculo";
import type { Resultado, RolPlataforma } from "@/lib/tipos";
import type { UsuarioSesion } from "./contexto-nube";
import { iniciales, MenuUsuario } from "./MenuUsuario";

const ACCIONES: Record<string, string> = {
  "dashboard.crear": "creó el dashboard",
  "dashboard.eliminar": "eliminó el dashboard",
  "dashboard.visibilidad": "cambió la publicación de",
  "dashboard.enlace_creado": "creó un enlace público para",
  "dashboard.enlace_revocado": "revocó el enlace público de",
  "permiso.otorgar": "compartió",
  "permiso.cambiar": "cambió un acceso de",
  "permiso.quitar": "quitó un acceso de",
  "perfil.rol": "cambió el rol de",
  "perfil.estado": "cambió el estado de",
  "usuario.eliminar": "eliminó la cuenta de",
};

const hace30 = () => Date.now() - 30 * 864e5;

export function AdminCliente({ yo, datos }: { yo: UsuarioSesion; datos: DatosAdmin }) {
  const resumen = useMemo(() => {
    const desde = hace30();
    return [
      { icono: Users, etiqueta: "Usuarios", valor: datos.usuarios.length },
      { icono: UserCheck, etiqueta: "Activos últimos 30 días", valor: datos.usuarios.filter((u) => u.ultimo_acceso && Date.parse(u.ultimo_acceso) > desde).length },
      { icono: LayoutGrid, etiqueta: "Dashboards", valor: datos.dashboards.length },
      { icono: Globe2, etiqueta: "Publicados o con enlace", valor: datos.dashboards.filter((d) => d.publicado || d.enlace).length },
    ];
  }, [datos]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-[color-mix(in_srgb,var(--bg)_80%,transparent)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-4 sm:px-6">
          <Button asChild variant="ghost" size="sm"><Link href="/dashboards"><ArrowLeft /> Mi espacio</Link></Button>
          <span className="flex items-center gap-1.5 text-[13px] font-semibold"><Shield size={15} className="text-accent" /> Administración</span>
          <div className="flex-1" />
          <MenuUsuario usuario={yo} />
        </div>
      </header>
      <main className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Administración</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">Gestiona cuentas, roles y lo que se publica en la plataforma.</p>
        </div>
        <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {resumen.map(({ icono: Icono, etiqueta, valor }) => (
            <li key={etiqueta} className="rounded-xl border border-line bg-card p-5">
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground"><Icono size={14} /> {etiqueta}</p>
              <p className="mt-1 text-[30px] font-semibold tracking-tight tabular-nums">{formato(valor)}</p>
            </li>
          ))}
        </ul>
        <Tabs defaultValue="usuarios" className="gap-5">
          <TabsList variant="line">
            <TabsTrigger value="usuarios"><Users /> Usuarios</TabsTrigger>
            <TabsTrigger value="dashboards"><LayoutGrid /> Dashboards</TabsTrigger>
            <TabsTrigger value="actividad"><Activity /> Actividad</TabsTrigger>
          </TabsList>
          <TabsContent value="usuarios"><TablaUsuarios usuarios={datos.usuarios} yo={yo} /></TabsContent>
          <TabsContent value="dashboards"><TablaDashboards datos={datos} /></TabsContent>
          <TabsContent value="actividad"><ListaActividad datos={datos} /></TabsContent>
        </Tabs>
      </main>
      <Toaster position="bottom-right" closeButton />
    </div>
  );
}

function useAccion() {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const ejecutar = (f: () => Promise<Resultado>) =>
    iniciar(async () => {
      try {
        const r = await f();
        if (!r.ok) return void toast.error(r.error);
        toast.success(r.mensaje ?? "Listo");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo completar.");
      }
    });
  return { pendiente, ejecutar };
}

function TablaUsuarios({ usuarios, yo }: { usuarios: FilaUsuario[]; yo: UsuarioSesion }) {
  const [q, setQ] = useState("");
  const [rol, setRol] = useState("todos");
  const [estado, setEstado] = useState("todos");
  const [aEliminar, setAEliminar] = useState<FilaUsuario | null>(null);
  const { pendiente, ejecutar } = useAccion();
  const visibles = usuarios.filter(
    (u) =>
      (rol === "todos" || u.rol === rol) &&
      (estado === "todos" || u.estado === estado) &&
      `${u.nombre} ${u.email}`.toLowerCase().includes(q.trim().toLowerCase()),
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <label className="relative w-full max-w-xs">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o correo…" className="pl-8" aria-label="Buscar usuarios" />
        </label>
        <Select value={rol} onValueChange={setRol}>
          <SelectTrigger className="w-[150px]" aria-label="Filtrar por rol"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todos los roles</SelectItem><SelectItem value="admin">Administradores</SelectItem><SelectItem value="miembro">Miembros</SelectItem></SelectContent>
        </Select>
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="w-[150px]" aria-label="Filtrar por estado"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todos los estados</SelectItem><SelectItem value="activo">Activos</SelectItem><SelectItem value="suspendido">Suspendidos</SelectItem></SelectContent>
        </Select>
        <span className="ml-auto self-center text-[12px] text-muted-foreground">{formato(visibles.length)} de {formato(usuarios.length)}</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Dashboards</TableHead>
              <TableHead>Alta</TableHead>
              <TableHead>Último acceso</TableHead>
              <TableHead className="w-10"><span className="sr-only">Acciones</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.map((u) => {
              const soyYo = u.id === yo.id;
              return (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8"><AvatarFallback className="text-[11px]">{iniciales(u.nombre, u.email)}</AvatarFallback></Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{u.nombre || "Sin nombre"} {soyYo && <span className="text-muted-foreground">(tú)</span>}</p>
                        <p className="truncate text-[12px] text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select value={u.rol} disabled={soyYo || pendiente} onValueChange={(v) => ejecutar(() => cambiarRol(u.id, v as RolPlataforma))}>
                      <SelectTrigger size="sm" className="w-[140px]" aria-label={`Rol de ${u.email}`}><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="miembro">Miembro</SelectItem><SelectItem value="admin">Administrador</SelectItem></SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {u.estado === "activo" ? (
                      <Badge variant="secondary" className="gap-1" style={{ color: "var(--ok-text)", background: "var(--ok-soft)" }}><CheckCircle2 size={11} /> Activo</Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1" style={{ color: "var(--critical-text)", background: "var(--critical-soft)" }}><Ban size={11} /> Suspendido</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formato(u.dashboards)}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{fechaCorta(new Date(u.creado_en))}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{u.ultimo_acceso ? fechaCorta(new Date(u.ultimo_acceso)) : "Nunca"}</TableCell>
                  <TableCell>
                    {!soyYo && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Acciones para ${u.email}`} disabled={pendiente}>{pendiente ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}</Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {u.estado === "activo" ? (
                            <DropdownMenuItem onSelect={() => ejecutar(() => cambiarEstado(u.id, true))}><Ban /> Suspender cuenta</DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onSelect={() => ejecutar(() => cambiarEstado(u.id, false))}><UserCheck /> Reactivar cuenta</DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setAEliminar(u)}><Trash2 /> Eliminar cuenta…</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {!visibles.length && (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Ningún usuario coincide con la búsqueda.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <AlertDialog open={Boolean(aEliminar)} onOpenChange={(v) => !v && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la cuenta de {aEliminar?.nombre || aEliminar?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminan su acceso, sus {formato(aEliminar?.dashboards ?? 0)} dashboards con sus archivos y todos los accesos compartidos. Esta acción no se puede deshacer. Si solo quieres impedir que ingrese, suspende la cuenta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { const u = aEliminar!; setAEliminar(null); ejecutar(() => eliminarUsuario(u.id)); }}>
              Eliminar cuenta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TablaDashboards({ datos }: { datos: DatosAdmin }) {
  const [q, setQ] = useState("");
  const { pendiente, ejecutar } = useAccion();
  const visibles = datos.dashboards.filter((d) => `${d.titulo} ${d.dueno}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="flex flex-col gap-3">
      <label className="relative w-full max-w-xs">
        <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título o dueño…" className="pl-8" aria-label="Buscar dashboards" />
      </label>
      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dashboard</TableHead>
              <TableHead>Dueño</TableHead>
              <TableHead>Visibilidad</TableHead>
              <TableHead>Actualizado</TableHead>
              <TableHead className="w-10"><span className="sr-only">Acciones</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium"><Link href={`/d/${d.id}`} className="hover:underline">{d.titulo}</Link></TableCell>
                <TableCell className="text-muted-foreground">{d.dueno}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {!d.publicado && !d.enlace && d.compartidoCon === 0 && <Badge variant="outline">Privado</Badge>}
                    {d.publicado && <Badge variant="secondary" className="gap-1"><Users size={11} /> Publicado</Badge>}
                    {d.enlace && <Badge variant="secondary" className="gap-1"><Globe2 size={11} /> Enlace público</Badge>}
                    {d.compartidoCon > 0 && <Badge variant="secondary" className="gap-1"><Share2 size={11} /> {d.compartidoCon}</Badge>}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{fechaCorta(new Date(d.actualizado))}</TableCell>
                <TableCell>
                  {(d.publicado || d.enlace) && (
                    <Button variant="outline" size="sm" disabled={pendiente} onClick={() => ejecutar(() => quitarPublicacion(d.id))}>Retirar publicación</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!visibles.length && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No hay dashboards.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ListaActividad({ datos }: { datos: DatosAdmin }) {
  if (!datos.actividad.length) return <p className="py-10 text-center text-[13px] text-muted-foreground">Todavía no hay actividad registrada.</p>;
  const hora = new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" });
  return (
    <ol className="flex flex-col rounded-xl border border-line bg-card">
      {datos.actividad.map((a) => {
        const nivel = a.detalle.nivel === "editor" ? " (edición)" : a.detalle.nivel === "lector" ? " (lectura)" : "";
        const vis = a.accion === "dashboard.visibilidad" ? (a.detalle.visibilidad === "plataforma" ? " → publicado" : " → privado") : "";
        return (
          <li key={a.id} className="flex items-baseline gap-3 border-b border-line px-4 py-3 text-[13px] last:border-0">
            <span className="min-w-0 flex-1">
              <strong className="font-medium">{a.actor}</strong> <span className="text-muted-foreground">{ACCIONES[a.accion] ?? a.accion}</span> <strong className="font-medium">{a.objetivo}</strong>
              <span className="text-muted-foreground">{nivel}{vis}</span>
            </span>
            <time className="shrink-0 text-[12px] text-muted-foreground tabular-nums" dateTime={a.creado}>{hora.format(new Date(a.creado))}</time>
          </li>
        );
      })}
    </ol>
  );
}
