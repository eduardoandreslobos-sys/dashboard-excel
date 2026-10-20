/** Filas de la base de datos (ver supabase/migrations). */
export type RolPlataforma = "admin" | "miembro";
export type EstadoUsuario = "activo" | "suspendido";
export type Visibilidad = "privado" | "plataforma";
export type NivelPermiso = "lector" | "editor";
/** Lo que el usuario actual puede hacer con un dashboard. */
export type Acceso = "dueno" | "editor" | "lector";

export interface Perfil {
  id: string;
  email: string;
  nombre: string;
  avatar_url: string | null;
  rol: RolPlataforma;
  estado: EstadoUsuario;
  creado_en: string;
  ultimo_acceso: string | null;
}

/** Vista guardada del dashboard: lo que se restaura al abrirlo. */
export interface ConfigDashboard {
  tablaId?: string;
  medida?: string | null;
  vista?: string;
  periodo?: string;
  filtros?: { categorias: Record<string, string[]>; fechas: Record<string, [number, number]> };
}

export interface Dashboard {
  id: string;
  workspace_id: string;
  owner_id: string;
  titulo: string;
  descripcion: string;
  visibilidad: Visibilidad;
  enlace_publico: string | null;
  archivo_path: string | null;
  archivo_nombre: string | null;
  archivo_tamano: number | null;
  config: ConfigDashboard;
  creado_en: string;
  actualizado_en: string;
}

export interface Permiso {
  dashboard_id: string;
  user_id: string;
  nivel: NivelPermiso;
  creado_en: string;
}

export interface PerfilBasico {
  id: string;
  nombre: string;
  email: string;
  avatar_url?: string | null;
}

/** Resultado estándar de una Server Action para useActionState. */
export type Resultado<T = undefined> = { ok: true; datos?: T; mensaje?: string } | { ok: false; error: string };
