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
 * la transacción en esa posición ya existe entre las existentes (clave
 * natural coincide), `false` cuando es nueva.
 *
 * Cuenta copias (#114, IMP-05, ADR-004 §5): dos movimientos idénticos el
 * mismo día son dos movimientos. Si hay E copias guardadas de una clave y
 * el archivo trae n, las primeras min(E, n) en el orden del archivo son
 * duplicadas y el resto son nuevas. Así una segunda compra idéntica no se
 * pierde, y volver a subir el mismo archivo (o uno que se solapa) no
 * duplica.
 *
 * Es una función pura y stateless. El caller (`PreviewIngestaUseCase`,
 * `DetectarDuplicadosUseCase`) es responsable de obtener `existentes` via
 * `ITransaccionExistenteReader.buscarPorCuentaYRango`.
 *
 * La comparación usa `construirClaveDuplicado` para garantizar fuente única
 * de la clave natural (DRY, D-07).
 *
 * Preserva el orden: `resultado[i]` corresponde a `transacciones[i]`.
 */
export function marcarDuplicados(
  existentes: ReadonlyArray<TransaccionExistente>,
  transacciones: ReadonlyArray<Transaccion>,
): boolean[] {
  if (transacciones.length === 0) return [];

  // Copias guardadas por clave, consumidas a medida que el archivo las repite.
  const copiasRestantes = new Map<string, number>();
  for (const row of existentes) {
    const clave = construirClaveDuplicado({
      fecha: row.fecha,
      descripcion: row.descripcion,
      cargo: row.cargo.toString(),
      abono: row.abono.toString(),
    });
    copiasRestantes.set(clave, (copiasRestantes.get(clave) ?? 0) + 1);
  }

  return transacciones.map((tx) => {
    const clave = construirClaveDuplicado({
      fecha: tx.fecha,
      descripcion: tx.descripcion,
      cargo: String(tx.cargo),
      abono: String(tx.abono),
    });
    const restantes = copiasRestantes.get(clave) ?? 0;
    if (restantes === 0) return false;
    copiasRestantes.set(clave, restantes - 1);
    return true;
  });
}
