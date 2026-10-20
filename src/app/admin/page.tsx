import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminCliente } from "@/components/nube/Admin";
import { CargandoPagina } from "@/components/nube/Estados";
import { cargarAdmin } from "@/lib/servidor/admin-datos";
import { verificarAdmin } from "@/lib/servidor/sesion";

export const metadata: Metadata = { title: "Administración · Dashboard Excel" };

export default function Pagina() {
  return (
    <Suspense fallback={<CargandoPagina />}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  const yo = await verificarAdmin();
  const datos = await cargarAdmin();
  return <AdminCliente yo={{ id: yo.id, nombre: yo.nombre, email: yo.email, rol: yo.rol }} datos={datos} />;
}
