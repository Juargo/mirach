import { Bucket } from './bucket';

/** Tipos de coincidencia disponibles para un patrón de clasificación. */
export type MatchType = 'CONTAINS' | 'STARTS_WITH' | 'REGEX';

/**
 * Forma canónica de un texto para comparar patrones (CLA-14): sin espacios en
 * los bordes, en minúsculas y sin tildes ni diacríticos ("Ñuñoa" → "nunoa").
 * La usan `coincide()` y el desempate por largo (CLA-12), para que ambos
 * midan el mismo texto.
 */
export function normalizarTextoPatron(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
}

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
 *   - CONTAINS / STARTS_WITH: `normalizarTextoPatron` en ambos lados (trim,
 *     minúsculas y sin tildes — CLA-14).
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
    switch (this.matchType) {
      case 'CONTAINS':
        return normalizarTextoPatron(descripcion).includes(
          normalizarTextoPatron(this.patron),
        );

      case 'STARTS_WITH':
        return normalizarTextoPatron(descripcion).startsWith(
          normalizarTextoPatron(this.patron),
        );

      case 'REGEX':
        // Se usa `this.patron` crudo (no `pat`): normalizar el source de una regex
        // corrompería metacaracteres sensibles a mayúsculas (\S \D \W \B → \s \d \w \b)
        // y el whitespace intencional. La case-insensitivity la aporta el flag `i`.
        // La descripción conserva sus tildes: una regex heredada puede nombrarlas.
        try {
          return new RegExp(this.patron, 'i').test(
            descripcion.trim().toLowerCase(),
          );
        } catch {
          return false;
        }

      default:
        // Unknown matchType from DB (e.g., a future type not yet handled) → safe no-match.
        return false;
    }
  }
}
