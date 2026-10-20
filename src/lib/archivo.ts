/** Guarda el último Excel en IndexedDB (queda solo en este navegador) y vigila archivos vinculados. */

export interface Meta {
  nombre: string;
  tamano: number;
  modificado: number;
  origen: "muestra" | "subido" | "vinculado" | "nube";
}

const BD = "dashboard-excel";
const ALMACEN = "archivos";

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const req = indexedDB.open(BD, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(ALMACEN);
    req.onsuccess = () => ok(req.result);
    req.onerror = () => mal(req.error);
  });
}

export async function guardarUltimo(datos: ArrayBuffer, meta: Meta): Promise<void> {
  try {
    const bd = await abrir();
    await new Promise<void>((ok, mal) => {
      const tx = bd.transaction(ALMACEN, "readwrite");
      tx.objectStore(ALMACEN).put({ datos, meta }, "ultimo");
      tx.oncomplete = () => ok();
      tx.onerror = () => mal(tx.error);
    });
  } catch {
    // Sin almacenamiento (modo privado): el dashboard funciona igual, solo no recuerda el archivo.
  }
}

export async function leerUltimo(): Promise<{ datos: ArrayBuffer; meta: Meta } | null> {
  try {
    const bd = await abrir();
    return await new Promise((ok) => {
      const req = bd.transaction(ALMACEN).objectStore(ALMACEN).get("ultimo");
      req.onsuccess = () => ok(req.result ?? null);
      req.onerror = () => ok(null);
    });
  } catch {
    return null;
  }
}

export async function olvidarUltimo(): Promise<void> {
  try {
    const bd = await abrir();
    bd.transaction(ALMACEN, "readwrite").objectStore(ALMACEN).delete("ultimo");
  } catch {}
}

interface ManejadorArchivo {
  getFile(): Promise<File>;
}

export const puedeVincular = () => typeof window !== "undefined" && "showOpenFilePicker" in window;

/** Abre el selector nativo (Chrome/Edge) y devuelve un manejador que se puede volver a leer. */
export async function elegirVinculado(): Promise<ManejadorArchivo | null> {
  const w = window as unknown as {
    showOpenFilePicker: (o: object) => Promise<ManejadorArchivo[]>;
  };
  try {
    const [h] = await w.showOpenFilePicker({
      types: [{ description: "Excel", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx", ".xlsm", ".xls"] } }],
      multiple: false,
    });
    return h;
  } catch {
    return null;
  }
}

export type { ManejadorArchivo };
