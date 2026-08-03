import type { Prisma } from '@prisma/client';
import { Bucket } from '../../domain/value-objects/bucket';
import { DemoTransaccionDef } from './demo-data';
import { ICryptoService } from '../../application/ports/crypto-service.port';

/**
 * seedDemoTransacciones — mapea las definiciones estáticas de `demo-data.ts`
 * a filas insertables (`Prisma.TransaccionCreateManyInput`), resolviendo
 * `bucketKey → bucketId` vía `bucketIds` en tiempo de ejecución (DEMO-DATA-05
 * — nunca hardcodea ids, así el seed sobrevive a migraciones de bucket) y
 * `daysAgo → fecha` absoluta relativa a `ahora`.
 *
 * `descripcion` se cifra at rest a través del `ICryptoService` inyectado —
 * MISMO tratamiento que el camino real (`transaccion.mapper.ts`), para que el
 * seed demo no sea la única fuente de filas en texto plano. Sin esto, desde
 * que `AesGcmCryptoService.decrypt()` es fail-loud (US-036) leer una fila demo
 * rompe con 500 (#204).
 *
 * Función pura — no toca Prisma directamente; el repositorio decide cuándo y
 * cómo persistir el resultado dentro de su transacción.
 */
export function seedDemoTransacciones(
  defs: readonly DemoTransaccionDef[],
  bucketIds: Record<Bucket, string>,
  accountId: string,
  ingestaId: string,
  ahora: Date,
  crypto: ICryptoService,
): Prisma.TransaccionCreateManyInput[] {
  const unDiaMs = 24 * 60 * 60 * 1000;

  return defs.map((def) => ({
    accountId,
    ingestaId,
    descripcion: crypto.encrypt(def.descripcion),
    cargo: def.cargo,
    abono: def.abono,
    bucketId: bucketIds[def.bucketKey],
    fecha: new Date(ahora.getTime() - def.daysAgo * unDiaMs),
  }));
}
