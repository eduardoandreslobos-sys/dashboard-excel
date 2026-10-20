"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Acceso, PerfilBasico, RolPlataforma, Visibilidad } from "@/lib/tipos";

export interface UsuarioSesion extends PerfilBasico {
  rol: RolPlataforma;
}

export interface DatosNube {
  dashboard: {
    id: string;
    titulo: string;
    descripcion: string;
    visibilidad: Visibilidad;
    enlace: string | null;
    dueno: PerfilBasico | null;
    acceso: Acceso;
  };
  /** null en la vista pública (sin sesión). */
  usuario: UsuarioSesion | null;
}

const Ctx = createContext<DatosNube | null>(null);

export function ProveedorNube({ valor, children }: { valor: DatosNube | null; children: ReactNode }) {
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/** Datos del dashboard en la nube; null en modo local (demo sin cuenta). */
export function useNube(): DatosNube | null {
  return useContext(Ctx);
}
