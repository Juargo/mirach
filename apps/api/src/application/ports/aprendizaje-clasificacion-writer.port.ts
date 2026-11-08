import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { MatchType } from '../../domain/value-objects/patron-clasificacion';
import { CategoriaDesconocidaError } from '../../domain/errors/categoria-desconocida.error';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';
import { PatronNoEncontradoError } from '../../domain/errors/patron-no-encontrado.error';
import { Patron } from './patron-repository.port';

/** What happens to the pattern inside the learning transaction. */
export type AccionPatron =
  | {
      readonly tipo: 'crear';
      readonly patron: string;
      readonly matchType: MatchType;
      readonly prioridad: number;
    }
  /** CLA-17: the text lives in another category; it moves, keeping id and `creadoEn`. */
  | { readonly tipo: 'mover'; readonly patronId: string }
  /** The text already lives in the target category. */
  | { readonly tipo: 'mantener'; readonly patronId: string };

export interface CambiosAprendizaje {
  /** Target category: the caller's own, already validated by the use case. */
  readonly categoriaId: string;
  readonly patron: AccionPatron;
  /** Coinciding rows to move (S2). Manual rows are never written. */
  readonly moverTransaccionIds: ReadonlyArray<string>;
  /** S6: the movement the person reclassifies by hand (`clasificacionManual`). */
  readonly reclasificarTransaccionId?: string;
}

export interface ResultadoAprendizaje {
  readonly patron: Patron;
  readonly categoria: {
    readonly id: string;
    readonly nombre: string;
    readonly bucket: Bucket;
  };
  /** Rows actually moved (the count Prisma reports, not the ids sent). */
  readonly movidos: number;
}

export type AprendizajeClasificacionWriterError =
  | CategoriaDesconocidaError
  | TransaccionNoEncontradaError
  | PatronNoEncontradoError;

/**
 * IAprendizajeClasificacionWriter — the ONE write of the learning flows
 * (ADR-004:49: "Guardar un patrón y mover los movimientos coincidentes del
 * mes | Una transacción | CLA-15").
 *
 * Everything in `cambios` commits together or not at all: the optional
 * manual reclassification, the pattern (create, move or keep) and the move
 * of the coinciding rows, which get the target `categoriaId` and that
 * category's bucket and keep `clasificacionManual = false`.
 *
 * Every statement filters by `userId` in the SQL WHERE (RNF-SEC-006). A row
 * that became manual after it was read is not moved (the WHERE carries
 * `clasificacionManual = false`). Any failure rolls the whole change back
 * and returns `Result.fail`; never throws a business error.
 */
export interface IAprendizajeClasificacionWriter {
  aplicar(
    userId: string,
    cambios: CambiosAprendizaje,
  ): Promise<Result<ResultadoAprendizaje, AprendizajeClasificacionWriterError>>;
}
