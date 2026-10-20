"use client";

import { supabaseNavegador } from "@/lib/supabase/cliente";

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Sube el Excel directo a Storage desde el navegador (RLS valida que puedas editar ese dashboard). */
export async function subirExcel(path: string, archivo: Blob): Promise<void> {
  const { error } = await supabaseNavegador()
    .storage.from("excels")
    .upload(path, archivo, { contentType: archivo.type || TIPO_XLSX, upsert: false, cacheControl: "3600" });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("size") || m.includes("too large")) throw new Error("El archivo supera el tamaño máximo de 50 MB.");
    if (m.includes("mime") || m.includes("type")) throw new Error("Solo se aceptan archivos Excel (.xlsx, .xlsm, .xls).");
    throw new Error("No pude subir el archivo. Revisa tu conexión e inténtalo de nuevo.");
  }
}
