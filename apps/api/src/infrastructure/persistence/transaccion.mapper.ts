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
 * Convierte un number a BigInt exigiendo que sea un entero.
 * El dominio garantiza enteros positivos; esta precondición hace explícito
 * el contrato entre capas y evita ocultar bugs upstream con Math.trunc.
 */
function aBigIntEntero(valor: number, campo: string): bigint {
  if (!Number.isInteger(valor)) {
    throw new TypeError(
      `El campo "${campo}" debe ser un entero; se recibió "${valor}".`,
    );
  }
  return BigInt(valor);
}

/**
 * Convierte un BigInt de vuelta a number sin coerción silenciosa.
 * Números por encima de Number.MAX_SAFE_INTEGER (2^53-1) perderían precisión
 * al pasar a number, lo que anularía la razón de usar columnas BigInt; por
 * eso se lanza un error explícito en lugar de truncar en silencio.
 */
function aNumberSeguro(valor: bigint, campo: string): number {
  if (valor > MAX_BIGINT_SEGURO || valor < -MAX_BIGINT_SEGURO) {
    throw new RangeError(
      `El campo "${campo}" (${valor}) excede Number.MAX_SAFE_INTEGER y no ` +
        `puede convertirse a number sin pérdida de precisión.`,
    );
  }
  return Number(valor);
}

/**
 * Mapea una Transaccion de dominio a su forma de persistencia.
 * Conversión fina number→BigInt (exige enteros); pasa la descripción por crypto.
 */
export function aPersistencia(
  tx: Transaccion,
  crypto: ICryptoService,
): TransaccionPersistencia {
  return {
    fecha: tx.fecha,
    descripcion: crypto.encrypt(tx.descripcion),
    cargo: aBigIntEntero(tx.cargo, 'cargo'),
    abono: aBigIntEntero(tx.abono, 'abono'),
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
  return {
    fecha: row.fecha,
    descripcion: crypto.decrypt(row.descripcion),
    cargo: aNumberSeguro(row.cargo, 'cargo'),
    abono: aNumberSeguro(row.abono, 'abono'),
  };
}
