import { Bucket } from './bucket';

/** Tipos de coincidencia disponibles para un patrón de clasificación. */
export type MatchType = 'CONTAINS' | 'STARTS_WITH' | 'REGEX';

export interface PatronClasificacionProps {
  readonly id: string;
  readonly patron: string;
  readonly matchType: MatchType;
  readonly bucket: Bucket;
  readonly prioridad: number;
}

/**
 * PatronClasificacion — value object de dominio.
 *
 * Representa una regla de clasificación del catálogo. El método `coincide()`
 * evalúa si una descripción de transacción cumple el patrón.
 *
 * Garantías:
 *   - CONTAINS / STARTS_WITH: normalización a minúsculas + trim en ambos lados.
 *   - REGEX: flag `i`; malformed regex o fallo de ejecución → retorna false (NUNCA lanza).
 *   - Nunca lanza excepciones en ninguna ruta (invariante exigida por Result<T,E>).
 */
export class PatronClasificacion {
  readonly id: string;
  readonly patron: string;
  readonly matchType: MatchType;
  readonly bucket: Bucket;
  readonly prioridad: number;

  constructor(props: PatronClasificacionProps) {
    this.id = props.id;
    this.patron = props.patron;
    this.matchType = props.matchType;
    this.bucket = props.bucket;
    this.prioridad = props.prioridad;
  }

  /**
   * Evalúa si la descripción de una transacción coincide con este patrón.
   * Nunca lanza — errores de regex se capturan y retornan false.
   */
  coincide(descripcion: string): boolean {
    const desc = descripcion.trim().toLowerCase();
    const pat = this.patron.trim().toLowerCase();

    switch (this.matchType) {
      case 'CONTAINS':
        return desc.includes(pat);

      case 'STARTS_WITH':
        return desc.startsWith(pat);

      case 'REGEX':
        // Se usa `this.patron` crudo (no `pat`): normalizar el source de una regex
        // corrompería metacaracteres sensibles a mayúsculas (\S \D \W \B → \s \d \w \b)
        // y el whitespace intencional. La case-insensitivity la aporta el flag `i`.
        try {
          return new RegExp(this.patron, 'i').test(desc);
        } catch {
          return false;
        }
    }
  }
}
