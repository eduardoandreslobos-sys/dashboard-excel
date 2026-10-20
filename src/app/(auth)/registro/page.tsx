import type { Metadata } from "next";
import { Suspense } from "react";
import { FormRegistro } from "../formularios";

export const metadata: Metadata = { title: "Crear cuenta · Dashboard Excel" };

export default function Pagina() {
  return (
    <Suspense>
      <FormRegistro />
    </Suspense>
  );
}
