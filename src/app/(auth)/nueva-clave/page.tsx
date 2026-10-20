import type { Metadata } from "next";
import { Suspense } from "react";
import { FormNuevaClave } from "../formularios";

export const metadata: Metadata = { title: "Nueva contraseña · Dashboard Excel" };

export default function Pagina() {
  return (
    <Suspense>
      <FormNuevaClave />
    </Suspense>
  );
}
