import { Suspense } from "react";
import { notFound } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import { CargandoPagina, SinArchivo } from "@/components/nube/Estados";
import { cargarParaUsuario } from "@/lib/servidor/cargar";
import { verificarSesion } from "@/lib/servidor/sesion";

export default function Pagina({ params }: PageProps<"/d/[id]">) {
  return (
    <Suspense fallback={<CargandoPagina />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const yo = await verificarSesion(`/d/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const nube = await cargarParaUsuario(id, yo);
  if (!nube) notFound();
  if (!nube.fuente) return <SinArchivo titulo={nube.dashboard.titulo} />;
  return <Dashboard nube={nube} />;
}
