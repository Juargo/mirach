import { Bucket } from './bucket';

/** Tipos de coincidencia disponibles para un patrón de clasificación. */
export type MatchType = 'CONTAINS' | 'STARTS_WITH' | 'REGEX';

/**
 * Proyección mínima de la categoría propietaria de este patrón. Desde
 * ADR-037, `Categoria` ya no es un miembro de un enum cerrado — es una fila
 * propiedad del usuario; el patrón anida los tres campos que necesita para
 * derivar su `bucket` sin volver a consultar el catálogo.
 */
export interface CategoriaDePatron {
  readonly id: string;
  readonly nombre: string;
  readonly bucket: Bucket;
}

export interface PatronClasificacionProps {
  readonly id: string;
  readonly patron: string;
  readonly matchType: MatchType;
  readonly categoria: CategoriaDePatron;
  readonly prioridad: number;
}

/**
 * PatronClasificacion — value object de dominio.
 *
 * Representa una regla de clasificación del catálogo. El método `coincide()`
 * evalúa si una descripción de transacción cumple el patrón.
 *
 * CAT-02 (ADR-037): el patrón anida su `categoria` completa; `bucket` es un
 * getter que PROYECTA `categoria.bucket` — nunca se acepta ni se guarda como
 * campo hermano independiente, así el invariante "categoría↔bucket" se
 * sostiene por construcción (ver design.md D-03).
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
  readonly categoria: CategoriaDePatron;
  readonly prioridad: number;

  constructor(props: PatronClasificacionProps) {
    this.id = props.id;
    this.patron = props.patron;
    this.matchType = props.matchType;
    this.categoria = props.categoria;
    this.prioridad = props.prioridad;
  }

  /** Bucket PROYECTADO de la categoría anidada — nunca almacenado independientemente. */
  get bucket(): Bucket {
    return this.categoria.bucket;
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

      default:
        // Unknown matchType from DB (e.g., a future type not yet handled) → safe no-match.
        return false;
    }
  }
}
