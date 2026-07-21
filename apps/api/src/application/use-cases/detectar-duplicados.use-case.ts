import { Result } from '../../shared/result';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';
import { Transaccion } from '../../domain/value-objects/transaccion';
import { construirClaveDuplicado } from '../../domain/value-objects/clave-duplicado';
import { ITransaccionExistenteReader } from '../ports/transaccion-existente-reader.port';

/** Datos mínimos para detectar duplicados en un batch entrante (US-005). */
export interface DetectarDuplicadosInput {
  readonly accountId: string;
  readonly transacciones: ReadonlyArray<Transaccion>;
}

/**
 * Resultado de la detección: transacciones nuevas (a persistir) y el conteo
 * de duplicadas omitidas.
 */
export interface DetectarDuplicadosResult {
  readonly nuevas: ReadonlyArray<Transaccion>;
  readonly duplicadas: number;
}

/**
 * DetectarDuplicadosUseCase — detecta, dentro de un batch entrante, las
 * transacciones que ya existen para la cuenta (US-005, natural key
 * fecha+descripcion+cargo+abono, `accountId` acota el scope de la consulta).
 *
 * Algoritmo (guard-clause style):
 *   1. Batch vacío → ok sin consultar el reader (CA-04 trivial).
 *   2. min/max de `fecha` del batch entrante (una sola pasada).
 *   3. Consulta acotada al reader; si falla, propaga el fallo (conservador:
 *      si no podemos verificar, no persistimos un batch potencialmente
 *      duplicado).
 *   4. Construye un Set<clave> sobre las filas existentes.
 *   5. Particiona el batch entrante preservando el orden.
 *
 * Contrato: retorna Result y NUNCA lanza.
 */
export class DetectarDuplicadosUseCase {
  constructor(private readonly reader: ITransaccionExistenteReader) {}

  async execute(
    input: DetectarDuplicadosInput,
  ): Promise<Result<DetectarDuplicadosResult, PersistenciaFallidaError>> {
    const { accountId, transacciones } = input;

    if (transacciones.length === 0) {
      return Result.ok({ nuevas: [], duplicadas: 0 });
    }

    let fechaDesde = transacciones[0].fecha;
    let fechaHasta = transacciones[0].fecha;
    for (const tx of transacciones) {
      if (tx.fecha.getTime() < fechaDesde.getTime()) fechaDesde = tx.fecha;
      if (tx.fecha.getTime() > fechaHasta.getTime()) fechaHasta = tx.fecha;
    }

    const existentesResult = await this.reader.buscarPorCuentaYRango(
      accountId,
      fechaDesde,
      fechaHasta,
    );
    if (existentesResult.isFail()) {
      return Result.fail(existentesResult.getError());
    }

    const clavesExistentes = new Set(
      existentesResult.getValue().map((row) =>
        construirClaveDuplicado({
          fecha: row.fecha,
          descripcion: row.descripcion,
          cargo: row.cargo.toString(),
          abono: row.abono.toString(),
        }),
      ),
    );

    const nuevas: Transaccion[] = [];
    let duplicadas = 0;
    for (const tx of transacciones) {
      const clave = construirClaveDuplicado({
        fecha: tx.fecha,
        descripcion: tx.descripcion,
        cargo: String(tx.cargo),
        abono: String(tx.abono),
      });
      if (clavesExistentes.has(clave)) {
        duplicadas += 1;
      } else {
        nuevas.push(tx);
      }
    }

    return Result.ok({ nuevas, duplicadas });
  }
}
