import type { Metadata } from "next";
import { Suspense } from "react";
import { FormRecuperar } from "../formularios";

export const metadata: Metadata = { title: "Recuperar contraseña · Dashboard Excel" };

export default function Pagina() {
  return (
    <Suspense>
      <FormRecuperar />
    </Suspense>
  );
}
