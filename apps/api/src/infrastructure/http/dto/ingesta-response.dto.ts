import { ProcessIngestaResult } from '../../../application/use-cases/process-ingesta.use-case';

/**
 * TransaccionResponseDto — forma HTTP de una transacción normalizada y ya
 * persistida.
 *
 * cargo/abono viajan como STRING, aunque en este punto del pipeline
 * (ProcessIngestaResult.transacciones viene directo de
 * NormalizeTransactionsUseCase, ANTES del mapper BigInt de persistencia)
 * todavía son `number`, no BigInt. El dinero SÍ se persiste en columnas
 * BigInt (US-011) — este DTO adelanta ese mismo contrato string-siempre al
 * límite HTTP para que el cliente nunca dependa de que un `number` de
 * dinero quepa en un entero seguro de JS, hoy o si el pipeline cambia a
 * futuro para leer de vuelta desde la BD. La equivalencia con lo realmente
 * persistido la prueba el e2e (round-trip contra `prisma.transaccion`), no
 * este mapper. Formatear en este único punto evita un monkeypatch global de
 * BigInt.prototype.toJSON (decisión de diseño).
 */
export interface TransaccionResponseDto {
  fecha: string;
  descripcion: string;
  cargo: string;
  abono: string;
}

/** IngestaResponseDto — contrato HTTP de POST /api/ingestas en caso de éxito. */
export interface IngestaResponseDto {
  ingestaId: string;
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  archivo: { nombre: string; extension: string; tamanoBytes: number };
  totalTransacciones: number;
  transacciones: ReadonlyArray<TransaccionResponseDto>;
}

/**
 * Mapea el resultado del orquestador de aplicación (ProcessIngestaResult) al
 * contrato HTTP. Vive en infrastructure/http porque conoce la forma exacta
 * de la respuesta JSON; application no sabe nada de HTTP ni de DTOs.
 */
export function aIngestaResponseDto(data: ProcessIngestaResult): IngestaResponseDto {
  return {
    ingestaId: data.ingestaId,
    banco: data.banco.banco,
    tipoCuenta: data.banco.tipoCuenta,
    numeroCuenta: data.banco.numeroCuenta,
    archivo: {
      nombre: data.archivo.originalName,
      extension: data.archivo.extension,
      tamanoBytes: data.archivo.sizeInBytes,
    },
    totalTransacciones: data.total,
    transacciones: data.transacciones.map((tx) => ({
      fecha: tx.fecha.toISOString(),
      descripcion: tx.descripcion,
      cargo: String(tx.cargo),
      abono: String(tx.abono),
    })),
  };
}
