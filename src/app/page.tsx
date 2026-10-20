import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BarChart3, Lock, Share2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usuarioActual } from "@/lib/servidor/sesion";
import { supabaseConfigurado } from "@/lib/supabase/entorno";

export default function Pagina() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex h-16 w-full max-w-[1120px] items-center gap-2.5 px-4 sm:px-6">
        <span className="grid size-8 place-items-center rounded-lg text-white" style={{ background: "linear-gradient(135deg, var(--s1), var(--s7))" }}>
          <BarChart3 size={17} aria-hidden />
        </span>
        <span className="text-[14px] font-semibold">Dashboard Excel</span>
        <div className="flex-1" />
        <Button asChild variant="ghost"><Link href="/ingresar">Ingresar</Link></Button>
        <Button asChild><Link href="/registro">Crear cuenta</Link></Button>
      </header>
      <Suspense>
        <RedirigirConSesion />
      </Suspense>
      <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col justify-center gap-12 px-4 py-16 sm:px-6">
        <div className="flex max-w-2xl flex-col gap-5">
          <h1 className="text-[40px] leading-[1.05] font-semibold tracking-tight text-balance sm:text-[56px]">
            Tu Excel, convertido en un dashboard que puedes compartir.
          </h1>
          <p className="max-w-xl text-[16px] text-muted-foreground">
            Sube cualquier planilla: detectamos sus tablas, entendemos cada columna y armamos KPIs, tendencias y segmentos. Guárdalo en tu espacio y decide quién lo ve.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg"><Link href="/registro">Crear cuenta gratis</Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/demo">Probar sin cuenta</Link></Button>
          </div>
        </div>
        <ul className="grid gap-4 sm:grid-cols-3">
          {[
            { icono: Sparkles, titulo: "Automático", texto: "Hallazgos, KPIs y gráficos generados a partir de tus datos, sin configurar nada." },
            { icono: Lock, titulo: "Privado por defecto", texto: "Cada persona tiene su espacio. Nadie ve tus dashboards hasta que los compartes." },
            { icono: Share2, titulo: "Comparte a tu manera", texto: "Acceso de lectura o edición, publicación en la plataforma o un enlace público." },
          ].map(({ icono: Icono, titulo, texto }) => (
            <li key={titulo} className="rounded-xl border border-line bg-card p-5">
              <Icono size={18} className="text-accent" aria-hidden />
              <h2 className="mt-3 text-[15px] font-semibold">{titulo}</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">{texto}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

/** Con sesión abierta, la portada lleva directo a Mi espacio. */
async function RedirigirConSesion() {
  if (supabaseConfigurado() && (await usuarioActual())) redirect("/dashboards");
  return null;
}
