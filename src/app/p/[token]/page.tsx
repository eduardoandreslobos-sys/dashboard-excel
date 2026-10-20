import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import { CargandoPagina, SinArchivo } from "@/components/nube/Estados";
import { cargarPublico } from "@/lib/servidor/cargar";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Pagina({ params }: PageProps<"/p/[token]">) {
  return (
    <Suspense fallback={<CargandoPagina />}>
      <Contenido params={params} />
    </Suspense>
  );
}

async function Contenido({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const nube = await cargarPublico(token);
  if (!nube) notFound();
  if (!nube.fuente) return <SinArchivo titulo={nube.dashboard.titulo} />;
  return <Dashboard nube={nube} />;
}
