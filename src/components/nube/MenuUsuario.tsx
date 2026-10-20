"use client";

import Link from "next/link";
import { LayoutGrid, LogOut, Monitor, Moon, Rows3, Shield, Sun, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { salir } from "@/app/(auth)/acciones";
import type { UsuarioSesion } from "./contexto-nube";

export const iniciales = (nombre: string, email = "") =>
  (nombre || email).split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

interface Prefs {
  tema: string;
  setTema: (t: "light" | "dark" | "system") => void;
  densidad: string;
  setDensidad: (d: "comodo" | "compacto") => void;
}

/** Avatar con menú: espacio, perfil, administración, tema, densidad y salir. */
export function MenuUsuario({ usuario, prefs }: { usuario: UsuarioSesion; prefs?: Prefs }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label={`Cuenta de ${usuario.nombre || usuario.email}`}>
          <Avatar className="size-8">
            <AvatarFallback className="bg-accent-soft text-[12px] font-semibold text-accent">{iniciales(usuario.nombre, usuario.email)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          <span className="truncate text-[13px] font-medium text-foreground">{usuario.nombre || "Sin nombre"}</span>
          <span className="truncate text-[12px] text-muted-foreground">{usuario.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild><Link href="/dashboards"><LayoutGrid /> Mi espacio</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/perfil"><UserRound /> Perfil</Link></DropdownMenuItem>
          {usuario.rol === "admin" && <DropdownMenuItem asChild><Link href="/admin"><Shield /> Administración</Link></DropdownMenuItem>}
        </DropdownMenuGroup>
        {prefs && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Tema</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={prefs.tema} onValueChange={(v) => prefs.setTema(v as "light" | "dark" | "system")}>
              <DropdownMenuRadioItem value="light"><Sun /> Claro</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark"><Moon /> Oscuro</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system"><Monitor /> Según el sistema</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuLabel>Densidad</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={prefs.densidad} onValueChange={(v) => prefs.setDensidad(v as "comodo" | "compacto")}>
              <DropdownMenuRadioItem value="comodo"><Rows3 /> Cómoda</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="compacto"><Rows3 /> Compacta</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void salir()} variant="destructive"><LogOut /> Salir</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
