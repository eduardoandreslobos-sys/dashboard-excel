import type { Metadata } from "next";
import { Suspense } from "react";
import { EspacioCliente } from "@/components/nube/Espacio";
import { CargandoPagina } from "@/components/nube/Estados";
import { cargarEspacio } from "@/lib/servidor/espacio";
import { verificarSesion } from "@/lib/servidor/sesion";

export const metadata: Metadata = { title: "Mi espacio · Dashboard Excel" };

export default function Pagina() {
  return (
    <Suspense fallback={<CargandoPagina />}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  const yo = await verificarSesion("/dashboards");
  const espacio = await cargarEspacio(yo);
  return <EspacioCliente usuario={{ id: yo.id, nombre: yo.nombre, email: yo.email, rol: yo.rol }} espacio={espacio} />;
}
