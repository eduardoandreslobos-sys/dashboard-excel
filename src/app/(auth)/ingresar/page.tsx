import type { Metadata } from "next";
import { Suspense } from "react";
import { FormIngresar } from "../formularios";

export const metadata: Metadata = { title: "Ingresar · Dashboard Excel" };

export default function Pagina() {
  return (
    <Suspense>
      <FormIngresar />
    </Suspense>
  );
}
