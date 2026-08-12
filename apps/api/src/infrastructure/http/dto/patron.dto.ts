import { Patron } from '../../../application/ports/patron-repository.port';

/**
 * PatronDto — ÚNICA forma HTTP de un patrón de clasificación (US-038,
 * design.md §7.1). Reusada anidada (dentro de `CategoriaDto.patrones`) y
 * standalone (respuesta de `POST`/`PATCH /api/patrones`). `categoriaId` es
 * redundante cuando viaja anidado y se mantiene igual — un único schema, un
 * único mapper, un único sync spec.
 */
export interface PatronDto {
  readonly id: string;
  readonly categoriaId: string;
  readonly patron: string;
  readonly matchType: string;
  readonly prioridad: number;
}

export function aPatronDto(patron: Patron): PatronDto {
  return {
    id: patron.id,
    categoriaId: patron.categoriaId,
    patron: patron.patron,
    matchType: patron.matchType,
    prioridad: patron.prioridad,
  };
}
