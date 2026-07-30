import { Transaccion } from '../../domain/value-objects/transaccion';
import { ICryptoService } from '../../application/ports/crypto-service.port';

/**
 * Forma de persistencia de una transacción (US-011).
 *
 * El dinero se almacena como dos columnas BigInt (`cargo`/`abono`) para
 * evitar pérdida de precisión. `descripcion` se cifra at rest a través del
 * `ICryptoService` inyectado — en producción, `AesGcmCryptoService`
 * (AES-256-GCM, ADR-013). fecha/cargo/abono/bucketId permanecen en texto
 * plano y consultables (no son PII sensible por sí solos).
 * bucketId está reservado para US-012 y siempre se persiste como null aquí.
 */
export interface TransaccionPersistencia {
  fecha: Date;
  descripcion: string;
  cargo: bigint;
  abono: bigint;
  bucketId: string | null;
}

/**
 * Mapea una Transaccion de dominio a su forma de persistencia.
 *
 * Mapeo 1:1: el dinero ya es `BigInt` en el dominio, igual que en la columna.
 * No hay conversión de tipo (ni riesgo de overflow), solo se cifra la descripción.
 */
export function aPersistencia(
  tx: Transaccion,
  crypto: ICryptoService,
): TransaccionPersistencia {
  return {
    fecha: tx.fecha,
    descripcion: crypto.encrypt(tx.descripcion),
    cargo: tx.cargo,
    abono: tx.abono,
    bucketId: null,
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
