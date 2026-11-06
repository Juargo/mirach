import { Patron } from '../../../application/ports/patron-repository.port';
import { PatronExistente } from '../../../domain/value-objects/patron-existente';
import { VistaPreviaPatronResult } from '../../../application/use-cases/vista-previa-patron.use-case';

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

/** HTTP shape of `PatronExistente` (CLA-17). */
export interface PatronExistenteDto {
  readonly patronId: string;
  readonly categoriaId: string;
  readonly categoria: string;
  readonly bucket: string;
}

export function aPatronExistenteDto(
  existente: PatronExistente,
): PatronExistenteDto {
  return {
    patronId: existente.patronId,
    categoriaId: existente.categoriaId,
    categoria: existente.categoria,
    bucket: existente.bucket,
  };
}

/** `POST /api/patrones/vista-previa` 200 (CLA-15). Money as string. */
export interface PatronVistaPreviaDto {
  readonly periodo: string;
  readonly patron: string;
  readonly total: number;
  readonly coincidencias: ReadonlyArray<{
    readonly id: string;
    readonly descripcion: string;
    readonly fecha: string;
    readonly monto: string;
  }>;
  readonly existente: PatronExistenteDto | null;
}

export function aPatronVistaPreviaDto(
  data: VistaPreviaPatronResult,
): PatronVistaPreviaDto {
  return {
    periodo: data.periodo,
    patron: data.patron,
    total: data.coincidencias.length,
    coincidencias: data.coincidencias.map((m) => ({
      id: m.id,
      descripcion: m.descripcion,
      fecha: m.fecha.toISOString(),
      // Incomes never coincide (S2), so the amount is the expense.
      monto: String(m.cargo),
    })),
    existente:
      data.existente === null ? null : aPatronExistenteDto(data.existente),
  };
}
