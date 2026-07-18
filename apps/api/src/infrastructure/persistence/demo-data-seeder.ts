import type { Prisma } from '@prisma/client';
import { Bucket } from '../../domain/value-objects/bucket';
import { DemoTransaccionDef } from '../../../prisma/demo-data';

/**
 * seedDemoTransacciones — mapea las definiciones estáticas de `demo-data.ts`
 * a filas insertables (`Prisma.TransaccionCreateManyInput`), resolviendo
 * `bucketKey → bucketId` vía `bucketIds` en tiempo de ejecución (DEMO-DATA-05
 * — nunca hardcodea ids, así el seed sobrevive a migraciones de bucket) y
 * `daysAgo → fecha` absoluta relativa a `ahora`.
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
): Prisma.TransaccionCreateManyInput[] {
  const unDiaMs = 24 * 60 * 60 * 1000;

  return defs.map((def) => ({
    accountId,
    ingestaId,
    descripcion: def.descripcion,
    cargo: def.cargo,
    abono: def.abono,
    bucketId: bucketIds[def.bucketKey],
    fecha: new Date(ahora.getTime() - def.daysAgo * unDiaMs),
  }));
}
