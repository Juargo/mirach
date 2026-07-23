import { Transaccion } from '../../domain/value-objects/transaccion';
import { ICryptoService } from '../../application/ports/crypto-service.port';

/**
 * Forma de persistencia de una transacción (US-011).
 *
 * El dinero se almacena como dos columnas BigInt (`cargo`/`abono`) para
 * evitar pérdida de precisión. La descripción se pasa por ICryptoService,
 * cuya implementación por defecto (NoOpCryptoService) es identidad: NO
 * cifra. El cifrado real está DIFERIDO (task 11.6 / era US-012); ninguna
 * capa debe asumir protección at-rest en esta etapa.
 * fecha/cargo/abono/bucketId permanecen en texto plano y consultables.
 * bucketId está reservado para US-012 y siempre se persiste como null aquí.
 */
export interface TransaccionPersistencia {
  fecha: Date;
  descripcion: string;
  cargo: bigint;
  abono: bigint;
  bucketId: string | null;
}

const MAX_BIGINT_SEGURO = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Convierte un BigInt de vuelta a number sin coerción silenciosa.
 * Números por encima de Number.MAX_SAFE_INTEGER (2^53-1) perderían precisión
 * al pasar a number, lo que anularía la razón de usar columnas BigInt; por
 * eso se lanza un error explícito en lugar de truncar en silencio.
 */
function aNumberSeguro(valor: bigint, campo: string): number {
  if (valor > MAX_BIGINT_SEGURO || valor < -MAX_BIGINT_SEGURO) {
    // No se interpola el monto crudo (dato sensible); solo campo y el límite.
    throw new RangeError(
      `El campo "${campo}" excede Number.MAX_SAFE_INTEGER y no puede ` +
        `convertirse a number sin pérdida de precisión.`,
    );
  }
  return Number(valor);
}

/**
 * Mapea una Transaccion de dominio a su forma de persistencia.
 *
 * Confía en el invariante del VO: `Transaccion.crear` ya garantiza que cargo y
 * abono son enteros ≥ 0, así que `BigInt(...)` nunca recibe un no-entero. No se
 * revalida aquí (single source of truth — el invariante vive solo en el VO).
 */
export function aPersistencia(
  tx: Transaccion,
  crypto: ICryptoService,
): TransaccionPersistencia {
  return {
    fecha: tx.fecha,
    descripcion: crypto.encrypt(tx.descripcion),
    cargo: BigInt(tx.cargo),
    abono: BigInt(tx.abono),
    bucketId: null,
  };
}

/**
 * Mapea una fila de persistencia de vuelta al dominio.
 * Conversión fina BigInt→number con guardas de overflow explícitas;
 * pasa la descripción por crypto (identidad por defecto).
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
    cargo: aNumberSeguro(row.cargo, 'cargo'),
    abono: aNumberSeguro(row.abono, 'abono'),
  }).getValue();
}
