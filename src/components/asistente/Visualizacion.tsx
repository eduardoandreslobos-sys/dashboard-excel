"use client";

import { useState } from "react";
import { Download, Maximize2 } from "lucide-react";
import { AreaTendencia, BarrasRanking, Dispersion } from "@/components/charts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formato } from "@/lib/calculo";
import type { Visualizacion as Spec } from "@/lib/asistente/herramientas";

const celda = (v: string | number | null) => (typeof v === "number" ? formato(v) : v ?? "—");

/** CSV con separador «;» y coma decimal, para que Excel en español lo abra bien. */
function aCsv(v: Spec): string {
  const num = (x: number) => String(x).replace(".", ",");
  const esc = (x: string | number | null) => {
    const s = x === null ? "" : typeof x === "number" ? num(x) : x;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  let filas: (string | number | null)[][];
  switch (v.tipo) {
    case "barras": filas = [["Grupo", v.nombre, "Registros"], ...v.barras.map((b) => [b.etiqueta, b.valor, b.n])]; break;
    case "lineas": filas = [["Periodo", v.nombre, "Registros"], ...v.puntos.map((p) => [p.etiqueta, p.valor, p.n])]; break;
    case "dispersion": filas = [[v.x, v.y], ...v.puntos]; break;
    case "tabla": filas = [v.columnas, ...v.filas]; break;
  }
  return "﻿" + filas.map((f) => f.map(esc).join(";")).join("\n");
}

function descargar(v: Spec) {
  const url = URL.createObjectURL(new Blob([aCsv(v)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${v.titulo.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "datos"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Cuerpo({ v, grande }: { v: Spec; grande: boolean }) {
  switch (v.tipo) {
    case "barras":
      return <BarrasRanking barras={v.barras} nombre={v.nombre} etiqueta={v.titulo} sumable={v.sumable} />;
    case "lineas":
      return <AreaTendencia puntos={v.puntos} nombre={v.nombre} etiqueta={v.titulo} sumable={v.sumable} alto={grande ? 380 : 200} anotar={grande} />;
    case "dispersion":
      return <Dispersion series={[{ nombre: `${v.puntos.length.toLocaleString("es-CL")} registros`, color: "var(--s1)", puntos: v.puntos }]} x={v.x} y={v.y} etiqueta={v.titulo} alto={grande ? 420 : 240} />;
    case "tabla":
      return (
        <div className={`overflow-auto rounded-lg border border-border ${grande ? "max-h-[70vh]" : "max-h-72"}`}>
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 bg-muted">
              <tr>
                {v.columnas.map((c, i) => (
                  <th key={c} scope="col" className={`px-2.5 py-1.5 font-medium whitespace-nowrap text-muted-foreground ${i === 0 ? "text-left" : "text-right"}`}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {v.filas.map((fila, i) => (
                <tr key={i} className="border-t border-border">
                  {fila.map((x, j) => (
                    <td key={j} className={`px-2.5 py-1.5 whitespace-nowrap ${typeof x === "number" ? "text-right tabular-nums" : "text-left"}`}>{celda(x)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** Gráfico o tabla creado por el asistente, con opción de ampliar y descargar CSV. */
export function Visualizacion({ v }: { v: Spec }) {
  const [ampliado, setAmpliado] = useState(false);
  const filtros = Object.entries(v.filtros).filter(([, valores]) => valores.length);
  const filtrosTexto = filtros.map(([c, valores]) => `${c}: ${valores.join(", ")}`).join(" · ");

  return (
    <figure className="m-0 rounded-xl border border-border bg-card p-3">
      <figcaption className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] leading-5 font-semibold">{v.titulo}</p>
          {filtrosTexto && <p className="truncate text-[11px] text-muted-foreground" title={filtrosTexto}>Filtrado por {filtrosTexto}</p>}
        </div>
        <button type="button" onClick={() => descargar(v)} aria-label={`Descargar «${v.titulo}» como CSV`} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <Download className="size-3.5" />
        </button>
        <button type="button" onClick={() => setAmpliado(true)} aria-label={`Ampliar «${v.titulo}»`} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <Maximize2 className="size-3.5" />
        </button>
      </figcaption>
      <Cuerpo v={v} grande={false} />
      <Dialog open={ampliado} onOpenChange={setAmpliado}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{v.titulo}</DialogTitle>
            <DialogDescription>{filtrosTexto ? `Filtrado por ${filtrosTexto}. ` : ""}Creado por el asistente con los datos de esta tabla.</DialogDescription>
          </DialogHeader>
          <Cuerpo v={v} grande />
        </DialogContent>
      </Dialog>
    </figure>
  );
}
