"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { actualizarPerfil, cambiarClave } from "@/lib/servidor/perfil";
import { fechaCorta } from "@/lib/calculo";
import type { Perfil, Resultado } from "@/lib/tipos";
import { MenuUsuario } from "./MenuUsuario";

function useAviso(estado: Resultado | null) {
  useEffect(() => {
    if (!estado) return;
    if (estado.ok) toast.success(estado.mensaje ?? "Listo");
    else toast.error(estado.error);
  }, [estado]);
}

export function PerfilCliente({ perfil }: { perfil: Perfil }) {
  const [ePerfil, enviarPerfil, pPerfil] = useActionState(actualizarPerfil, null);
  const [eClave, enviarClave, pClave] = useActionState(cambiarClave, null);
  useAviso(ePerfil);
  useAviso(eClave);
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-14 max-w-[720px] items-center gap-3 px-4">
        <Button asChild variant="ghost" size="sm"><Link href="/dashboards"><ArrowLeft /> Mi espacio</Link></Button>
        <div className="flex-1" />
        <MenuUsuario usuario={perfil} />
      </header>
      <main className="mx-auto flex max-w-[720px] flex-col gap-6 px-4 py-6">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">Perfil</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            {perfil.email}
            <Badge variant="secondary">{perfil.rol === "admin" ? "Administrador" : "Miembro"}</Badge>
            <span>· desde {fechaCorta(new Date(perfil.creado_en))}</span>
          </p>
        </div>
        <Card>
          <CardHeader><CardTitle>Tus datos</CardTitle><CardDescription>Tu nombre es lo que ven las personas con quienes compartes dashboards.</CardDescription></CardHeader>
          <CardContent>
            <form action={enviarPerfil} className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-1.5"><Label htmlFor="nombre">Nombre</Label><Input id="nombre" name="nombre" defaultValue={perfil.nombre} required maxLength={80} /></div>
              <Button type="submit" disabled={pPerfil}>{pPerfil && <Loader2 className="animate-spin" />} Guardar</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Contraseña</CardTitle><CardDescription>Usa al menos 8 caracteres.</CardDescription></CardHeader>
          <CardContent>
            <form action={enviarClave} className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5"><Label htmlFor="actual">Actual</Label><Input id="actual" name="actual" type="password" autoComplete="current-password" required /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="clave">Nueva</Label><Input id="clave" name="clave" type="password" autoComplete="new-password" minLength={8} required /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="confirmar">Repite la nueva</Label><Input id="confirmar" name="confirmar" type="password" autoComplete="new-password" minLength={8} required /></div>
              <div className="sm:col-span-3"><Button type="submit" disabled={pClave}>{pClave && <Loader2 className="animate-spin" />} Cambiar contraseña</Button></div>
            </form>
          </CardContent>
        </Card>
      </main>
      <Toaster position="bottom-right" closeButton />
    </div>
  );
}
