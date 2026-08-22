import { Transaccion } from '../../domain/value-objects/transaccion';
import { TransaccionExistente } from '../ports/transaccion-existente-reader.port';
import { construirClaveDuplicado } from '../../domain/value-objects/clave-duplicado';

/**
 * rangoFechas — calcula el rango [desde, hasta] de fechas en un batch de
 * transacciones entrantes. La función es pura y stateless.
 *
 * Extrae la lógica que estaba inline en `DetectarDuplicadosUseCase` (líneas
 * 59-63) para que tanto el use case de dedup como la vista previa usen la
 * MISMA derivación del rango (DRY — D-07).
 *
 * US-057 PR2 (carried-over obligation): la función es NON-THROWING para arreglo
 * vacío — retorna `null`. El caller (`DetectarDuplicadosUseCase`, ya guarda el
 * caso vacío antes de invocar; `PreviewIngestaUseCase`, guarda con `accountId`
 * `null` en D-06) simplifica su lógica: puede invocar directamente y verificar
 * el retorno en vez de mantener el guard separado.
 */
export function rangoFechas(
  transacciones: ReadonlyArray<Transaccion>,
): { desde: Date; hasta: Date } | null {
  if (transacciones.length === 0) {
    return null;
  }

  let desde = transacciones[0].fecha;
  let hasta = transacciones[0].fecha;

  for (const tx of transacciones) {
    if (tx.fecha.getTime() < desde.getTime()) desde = tx.fecha;
    if (tx.fecha.getTime() > hasta.getTime()) hasta = tx.fecha;
  }

  return { desde, hasta };
}

/**
 * marcarDuplicados — construye una máscara booleana por fila: `true` cuando
 * la transacción en esa posición ya existe en el set de existentes (clave
 * natural coincide), `false` cuando es nueva.
 *
 * Es una función pura y stateless. El caller (tipicamente `PreviewIngestaUseCase`)
 * es responsable de:
 *   1. Obtener `existentes` via `ITransaccionExistenteReader.buscarPorCuentaYRango`.
 *   2. Pasar los resultados acá.
 *
 * La comparación usa `construirClaveDuplicado` — la misma función que usa
 * `DetectarDuplicadosUseCase` — para garantizar fuente única de la clave
 * natural (DRY, D-07).
 *
 * Preserva el orden: `resultado[i]` corresponde a `transacciones[i]`.
 */
export function marcarDuplicados(
  existentes: ReadonlyArray<TransaccionExistente>,
  transacciones: ReadonlyArray<Transaccion>,
): boolean[] {
  if (transacciones.length === 0) return [];

  // Construye el Set<clave> sobre las filas existentes (misma lógica que
  // DetectarDuplicadosUseCase.execute — fuente única de la clave, D-07).
  const clavesExistentes = new Set(
    existentes.map((row) =>
      construirClaveDuplicado({
        fecha: row.fecha,
        descripcion: row.descripcion,
        cargo: row.cargo.toString(),
        abono: row.abono.toString(),
      }),
    ),
  );

  return transacciones.map((tx) => {
    const clave = construirClaveDuplicado({
      fecha: tx.fecha,
      descripcion: tx.descripcion,
      cargo: String(tx.cargo),
      abono: String(tx.abono),
    });
    return clavesExistentes.has(clave);
  });
}
