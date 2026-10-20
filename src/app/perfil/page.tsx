import type { Metadata } from "next";
import { Suspense } from "react";
import { CargandoPagina } from "@/components/nube/Estados";
import { PerfilCliente } from "@/components/nube/Perfil";
import { verificarSesion } from "@/lib/servidor/sesion";

export const metadata: Metadata = { title: "Perfil · Dashboard Excel" };

export default function Pagina() {
  return (
    <Suspense fallback={<CargandoPagina />}>
      <Contenido />
    </Suspense>
  );
}

async function Contenido() {
  const yo = await verificarSesion("/perfil");
  return <PerfilCliente perfil={yo} />;
}
