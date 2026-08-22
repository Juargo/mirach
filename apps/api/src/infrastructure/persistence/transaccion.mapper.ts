import { Transaccion } from '../../domain/value-objects/transaccion';
import { ICryptoService } from '../../application/ports/crypto-service.port';
import { TransaccionAPersistir } from '../../application/ports/ingesta-repository.port';
import { BUCKET_IDS } from './bucket-ids';

/**
 * Forma de persistencia de una transacción (US-011, ampliado en US-057).
 *
 * El dinero se almacena como dos columnas BigInt (`cargo`/`abono`) para
 * evitar pérdida de precisión. `descripcion` se cifra at rest a través del
 * `ICryptoService` inyectado — en producción, `AesGcmCryptoService`
 * (AES-256-GCM, ADR-013). fecha/cargo/abono permanecen en texto plano.
 *
 * `bucketId` es la FK física a `BucketPresupuesto` (resuelta desde el enum
 * de dominio `Bucket` via `BUCKET_IDS` — ÚNICO punto de resolución, D-15).
 * `null` cuando la clasificación está pendiente (one-shot path).
 *
 * `categoriaId` es la FK a `Categoria` del usuario. `null` cuando no hay
 * categoría asignada.
 *
 * IMPORTANTE (Fix 2 — spread hazard): `TransaccionPersistencia` contiene
 * EXCLUSIVAMENTE columnas escalares de Prisma. NUNCA incluir la `Transaccion`
 * VO original ni objetos anidados; `...aPersistencia(entry)` en `createMany`
 * no puede filtrar un VO al objeto de datos de Prisma.
 */
export interface TransaccionPersistencia {
  fecha: Date;
  descripcion: string;
  cargo: bigint;
  abono: bigint;
  bucketId: string | null;
  categoriaId: string | null;
}

/**
 * Mapea una TransaccionAPersistir a su forma de persistencia (US-057, D-11/D-15).
 *
 * Responsabilidades:
 *   - Extrae fecha/descripcion/cargo/abono de `entry.transaccion`.
 *   - Cifra `descripcion` vía `crypto.encrypt`.
 *   - Resuelve `entry.bucket` → FK física vía `BUCKET_IDS` (D-15/ADR-005:
 *     la resolución vive AQUÍ en el adapter, nunca en application).
 *   - Mapea `entry.categoriaId` directamente.
 *
 * Regression guard (one-shot callers):
 *   `{ transaccion, bucket: null, categoriaId: null }` → `{ bucketId: null, categoriaId: null }`
 *   byte-for-byte idéntico al comportamiento anterior.
 */
export function aPersistencia(
  entry: TransaccionAPersistir,
  crypto: ICryptoService,
): TransaccionPersistencia {
  const { transaccion: tx, bucket, categoriaId } = entry;
  return {
    fecha: tx.fecha,
    descripcion: crypto.encrypt(tx.descripcion),
    cargo: tx.cargo,
    abono: tx.abono,
    bucketId: bucket !== null ? BUCKET_IDS[bucket] : null,
    categoriaId,
  };
}

/**
 * Mapea una fila de persistencia de vuelta al dominio.
 * Mapeo 1:1 del dinero (BigInt↔BigInt); pasa la descripción por crypto.
 */
export function aDominio(
  row: TransaccionPersistencia,
  crypto: ICryptoService,
): Transaccion {
  // Frontera de confianza: la fila viene de NUESTRA propia DB, escrita por
  // `aPersistencia` desde Transacciones ya validadas. Un fail de `crear` aquí
  // NO es un error de negocio esperable sino corrupción de datos → fail-fast
  // (getValue lanza), en lugar de propagar Result a todos los lectores.
  return Transaccion.crear({
    fecha: row.fecha,
    descripcion: crypto.decrypt(row.descripcion),
    cargo: row.cargo,
    abono: row.abono,
  }).getValue();
}
