import type { Metadata } from "next";
import Dashboard from "@/components/Dashboard";

export const metadata: Metadata = { title: "Probar sin cuenta · Dashboard Excel" };

/** Modo de prueba: todo en el navegador, sin guardar en la nube. */
export default function Pagina() {
  return <Dashboard />;
}
