import Link from "next/link";
import { FileX2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function CargandoPagina() {
  return (
    <div className="min-h-screen" aria-busy="true" aria-label="Cargando">
      <div className="h-14 border-b border-line" />
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-6 sm:px-6">
        <Skeleton className="h-9 w-72 max-w-full" />
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[132px] rounded-xl" />)}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

export function SinArchivo({ titulo }: { titulo: string }) {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <FileX2 size={32} className="text-muted-foreground" aria-hidden />
        <h1 className="text-[18px] font-semibold">«{titulo}» no tiene un Excel</h1>
        <p className="text-[13px] text-muted-foreground">El archivo no se subió completo. Vuelve a Mi espacio y crea el dashboard de nuevo.</p>
        <Button asChild><Link href="/dashboards">Ir a Mi espacio</Link></Button>
      </div>
    </div>
  );
}
