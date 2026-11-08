import { Bucket } from './bucket';
import {
  PatronClasificacion,
  normalizarTextoPatron,
} from './patron-clasificacion';

/**
 * PatronExistente — the pattern that already holds a text, with its category
 * and bucket (CLA-17: "Si el patrón ya existe en otra categoría, la app lo
 * dice y ofrece moverlo"). Travels in the 409 `PATRON_DUPLICADO`, in the
 * preview and in the similar-movements suggestion.
 */
export interface PatronExistente {
  readonly patronId: string;
  readonly categoriaId: string;
  /** Category name. */
  readonly categoria: string;
  readonly bucket: Bucket;
}

/**
 * buscarPatronPorTexto — the pattern of `patrones` whose text equals `texto`
 * once both are folded with `normalizarTextoPatron` (trim, case and accents,
 * CLA-14): "cafe" collides with "Café". `excluirId` skips the pattern being
 * edited, so a pattern never collides with itself.
 *
 * Runs in memory on purpose: SQL `mode: 'insensitive'` folds case but not
 * accents. Callers load the person's patterns with `userId` in the WHERE.
 */
export function buscarPatronPorTexto<T extends { id: string; patron: string }>(
  patrones: ReadonlyArray<T>,
  texto: string,
  excluirId?: string,
): T | undefined {
  const buscado = normalizarTextoPatron(texto);
  return patrones.find(
    (p) => p.id !== excluirId && normalizarTextoPatron(p.patron) === buscado,
  );
}

export function aPatronExistente(patron: PatronClasificacion): PatronExistente {
  return {
    patronId: patron.id,
    categoriaId: patron.categoria.id,
    categoria: patron.categoria.nombre,
    bucket: patron.bucket,
  };
}
