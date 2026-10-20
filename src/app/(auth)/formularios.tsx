"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Resultado } from "@/lib/tipos";
import { ingresar, nuevaClave, recuperar, registrar } from "./acciones";

type Accion = (previo: Resultado | null, form: FormData) => Promise<Resultado>;

function Campo({ id, etiqueta, ...props }: { id: string; etiqueta: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Input id={id} name={id} required {...props} />
    </div>
  );
}

function Aviso({ tono, children }: { tono: "error" | "ok"; children: React.ReactNode }) {
  const Icono = tono === "error" ? TriangleAlert : CheckCircle2;
  return (
    <p
      role={tono === "error" ? "alert" : "status"}
      className="flex items-start gap-2 rounded-lg px-3 py-2 text-[13px]"
      style={{
        color: tono === "error" ? "var(--critical-text)" : "var(--ok-text)",
        background: tono === "error" ? "var(--critical-soft)" : "var(--ok-soft)",
      }}
    >
      <Icono size={15} className="mt-0.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function Formulario({
  titulo,
  descripcion,
  accion,
  boton,
  children,
  pie,
  avisoInicial,
}: {
  titulo: string;
  descripcion: string;
  accion: Accion;
  boton: string;
  children: React.ReactNode;
  pie?: React.ReactNode;
  avisoInicial?: { tono: "error" | "ok"; texto: string } | null;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  const exito = estado?.ok && estado.mensaje;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[20px]">{titulo}</CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>
      <CardContent>
        {exito ? (
          <Aviso tono="ok">{estado.mensaje}</Aviso>
        ) : (
          <form action={enviar} className="flex flex-col gap-4">
            {avisoInicial && !estado && <Aviso tono={avisoInicial.tono}>{avisoInicial.texto}</Aviso>}
            {children}
            {estado && !estado.ok && <Aviso tono="error">{estado.error}</Aviso>}
            <Button type="submit" disabled={pendiente} className="w-full">
              {pendiente && <Loader2 className="animate-spin" aria-hidden />}
              {boton}
            </Button>
          </form>
        )}
      </CardContent>
      {pie && <CardFooter className="justify-center text-[13px] text-muted-foreground">{pie}</CardFooter>}
    </Card>
  );
}

const enlace = "font-medium text-foreground underline-offset-4 hover:underline";

export function FormIngresar() {
  const params = useSearchParams();
  const aviso = params.get("suspendido")
    ? { tono: "error" as const, texto: "Tu cuenta está suspendida. Contacta a un administrador." }
    : params.get("enlace") === "invalido"
      ? { tono: "error" as const, texto: "El enlace expiró o ya se usó. Pide uno nuevo." }
      : params.get("confirmado")
        ? { tono: "ok" as const, texto: "Cuenta confirmada. Ya puedes ingresar." }
        : null;
  return (
    <Formulario
      titulo="Ingresar"
      descripcion="Accede a tu espacio de trabajo y tus dashboards."
      accion={ingresar}
      boton="Ingresar"
      avisoInicial={aviso}
      pie={<span>¿No tienes cuenta? <Link href="/registro" className={enlace}>Crea una</Link></span>}
    >
      <input type="hidden" name="siguiente" value={params.get("siguiente") ?? ""} />
      <Campo id="email" etiqueta="Correo" type="email" autoComplete="email" placeholder="nombre@empresa.cl" />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="clave">Contraseña</Label>
          <Link href="/recuperar" className="text-[12px] text-muted-foreground hover:text-foreground">¿La olvidaste?</Link>
        </div>
        <Input id="clave" name="clave" type="password" autoComplete="current-password" required />
      </div>
    </Formulario>
  );
}

export function FormRegistro() {
  return (
    <Formulario
      titulo="Crear cuenta"
      descripcion="Tendrás tu propio espacio para crear dashboards privados y compartirlos cuando quieras."
      accion={registrar}
      boton="Crear cuenta"
      pie={<span>¿Ya tienes cuenta? <Link href="/ingresar" className={enlace}>Ingresa</Link></span>}
    >
      <Campo id="nombre" etiqueta="Nombre" autoComplete="name" placeholder="Tu nombre" />
      <Campo id="email" etiqueta="Correo" type="email" autoComplete="email" placeholder="nombre@empresa.cl" />
      <Campo id="clave" etiqueta="Contraseña" type="password" autoComplete="new-password" minLength={8} placeholder="Mínimo 8 caracteres" />
      <Campo id="confirmar" etiqueta="Repite la contraseña" type="password" autoComplete="new-password" minLength={8} />
    </Formulario>
  );
}

export function FormRecuperar() {
  return (
    <Formulario
      titulo="Recuperar contraseña"
      descripcion="Te enviaremos un enlace para crear una nueva."
      accion={recuperar}
      boton="Enviar enlace"
      pie={<Link href="/ingresar" className={enlace}>Volver a ingresar</Link>}
    >
      <Campo id="email" etiqueta="Correo" type="email" autoComplete="email" />
    </Formulario>
  );
}

export function FormNuevaClave() {
  return (
    <Formulario titulo="Nueva contraseña" descripcion="Elige una contraseña de al menos 8 caracteres." accion={nuevaClave} boton="Guardar contraseña">
      <Campo id="clave" etiqueta="Nueva contraseña" type="password" autoComplete="new-password" minLength={8} />
      <Campo id="confirmar" etiqueta="Repite la contraseña" type="password" autoComplete="new-password" minLength={8} />
    </Formulario>
  );
}
