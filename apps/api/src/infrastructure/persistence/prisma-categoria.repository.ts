import { Result } from '../../shared/result';
import { Bucket } from '../../domain/value-objects/bucket';
import { MatchType } from '../../domain/value-objects/patron-clasificacion';
import {
  CategoriaConPatrones,
  ICategoriaRepository,
} from '../../application/ports/categoria-repository.port';
import { Patron } from '../../application/ports/patron-repository.port';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import type { PrismaClient } from '@prisma/client';
import { BUCKET_IDS } from './bucket-ids';

/**
 * categoriaInclude — include shape shared by all four read paths
 * (`listarConPatrones`, `buscarPorId`, `crear`, `actualizar`). A FUNCTION of
 * `userId`, not a module-level const, because the `transaccionesCount`
 * subquery's `where` depends on the caller (CAT039-01, RNF-SEC-006 — scoped
 * in SQL, never in memory). Same shape `actualizar()`'s re-stamp already
 * uses (`account: { userId }`).
 */
function categoriaInclude(userId: string) {
  return {
    bucket: true,
    patrones: true,
    _count: { select: { transacciones: { where: { account: { userId } } } } },
  } as const;
}

interface PatronRow {
  id: string;
  categoriaId: string;
  patron: string;
  matchType: string;
  prioridad: number;
}

interface CategoriaRow {
  id: string;
  nombre: string;
  bucket: { nombre: string };
  patrones: PatronRow[];
  _count: { transacciones: number };
}

/** Mismo tiebreak (prioridad, patron, id) de CategorizarTransaccionUseCase
 * (D-08) — dos representaciones de la misma regla, cross-referenciadas a
 * propósito en lugar de compartir una abstracción (design.md D-08). */
function ordenarPatrones(patrones: PatronRow[]): PatronRow[] {
  return [...patrones].sort((a, b) => {
    if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
    if (a.patron !== b.patron) return a.patron < b.patron ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function aPatron(row: PatronRow): Patron {
  return {
    id: row.id,
    categoriaId: row.categoriaId,
    patron: row.patron,
    matchType: row.matchType as MatchType,
    prioridad: row.prioridad,
  };
}

function aCategoriaConPatrones(row: CategoriaRow): CategoriaConPatrones {
  return {
    id: row.id,
    nombre: row.nombre,
    bucket: row.bucket.nombre as Bucket,
    patrones: ordenarPatrones(row.patrones).map(aPatron),
    transaccionesCount: row._count.transacciones,
  };
}

/**
 * PrismaCategoriaRepository — implementación del port ICategoriaRepository
 * (US-038, CAT038-01…04/07; US-039, CAT038-04 as modified).
 *
 * `userId` en el `WHERE` SQL de TODA consulta y mutación — nunca un filtro
 * en memoria (RNF-SEC-006). Ver el docblock de `eliminar()` para su
 * contrato transaccional.
 */
export class PrismaCategoriaRepository implements ICategoriaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listarConPatrones(userId: string): Promise<CategoriaConPatrones[]> {
    const rows = await this.prisma.categoria.findMany({
      where: { userId },
      include: categoriaInclude(userId),
      orderBy: { nombre: 'asc' },
    });
    return (rows as unknown as CategoriaRow[]).map(aCategoriaConPatrones);
  }

  async buscarPorId(
    userId: string,
    id: string,
  ): Promise<CategoriaConPatrones | null> {
    const row = await this.prisma.categoria.findFirst({
      where: { id, userId },
      include: categoriaInclude(userId),
    });
    return row === null ? null : aCategoriaConPatrones(row);
  }

  async existeNombre(
    userId: string,
    nombre: string,
    excluirId?: string,
  ): Promise<boolean> {
    const row = await this.prisma.categoria.findFirst({
      where: {
        userId,
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(excluirId !== undefined ? { id: { not: excluirId } } : {}),
      },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * crearConPatrones — REEMPLAZA al `crear()` anterior (design.md D-01,
   * CAT038-10). Categoría + patrones anidados en UN solo statement Prisma
   * (`categoria.create` con `patrones: { create: [...] }`) — un nested
   * write ES un implicit transaction: si CUALQUIER patrón fallara la
   * escritura (constraint, etc.), Prisma hace rollback de TODO,
   * incluyendo la categoría. No hace falta `$transaction` explícito.
   * `patrones: []` (o ausente) produce el mismo INSERT de categoría que el
   * `crear()` retirado — byte-identical (CAT038-10, "Omitting patrones
   * behaves exactly as before").
   */
  async crearConPatrones(
    userId: string,
    data: {
      nombre: string;
      bucket: string;
      patrones: ReadonlyArray<{
        patron: string;
        matchType: string;
        prioridad: number;
      }>;
    },
  ): Promise<CategoriaConPatrones> {
    const row = await this.prisma.categoria.create({
      data: {
        userId,
        nombre: data.nombre,
        bucketId: BUCKET_IDS[data.bucket as Bucket],
        // `userId`/`categoriaId` NUNCA se pasan acá — Prisma los DERIVA del
        // padre recién creado (composite FK `categoria` en
        // PatronClasificacion, schema.prisma:176): el tipo generado
        // `PatronClasificacionUncheckedCreateWithoutCategoriaInput` ni
        // siquiera los acepta como propiedad.
        patrones: {
          create: data.patrones.map((p) => ({
            patron: p.patron,
            matchType: p.matchType,
            prioridad: p.prioridad,
          })),
        },
      },
      include: categoriaInclude(userId),
    });
    return aCategoriaConPatrones(row);
  }

  async actualizar(
    userId: string,
    id: string,
    patch: { nombre?: string; bucket?: string },
  ): Promise<CategoriaConPatrones> {
    const data: { nombre?: string; bucketId?: string } = {};
    if (patch.nombre !== undefined) {
      data.nombre = patch.nombre;
    }
    if (patch.bucket !== undefined) {
      data.bucketId = BUCKET_IDS[patch.bucket as Bucket];
    }

    const updateCategoria = this.prisma.categoria.update({
      where: { id, userId },
      data,
      include: categoriaInclude(userId),
    });

    // `bucket` ausente del patch ⇒ el bucket no cambió, sin re-stamp (D-07).
    if (patch.bucket === undefined) {
      const row = await updateCategoria;
      return aCategoriaConPatrones(row);
    }

    // `bucket` presente ⇒ re-stamp DENTRO de la MISMA transacción, array
    // form (los dos statements no tienen lecturas interdependientes, D-07).
    const restamp = this.prisma.transaccion.updateMany({
      where: { categoriaId: id, account: { userId } }, // RNF-SEC-006 en SQL
      data: { bucketId: data.bucketId },
    });

    const [row] = await this.prisma.$transaction([updateCategoria, restamp]);
    return aCategoriaConPatrones(row);
  }

  /**
   * eliminar — array-form $transaction, children FIRST (US-039, CAT038-04 as modified).
   *
   * (1) Children first is MANDATORY, not stylistic: PatronClasificacion.categoria
   *     declares no onDelete (schema.prisma:176) ⇒ Prisma's default Restrict for a
   *     required relation ⇒ deleting a categoría that still has patrones raises an
   *     FK error. "Los patrones se borran con la categoría" es una necesidad
   *     estructural del delete, no una cortesía agregada.
   *
   * (2) NO sentinel, and NO in-use predicate. US-038 needed RollbackCategoriaEnUso
   *     porque un deleteMany de 0 filas NO hace rollback de un $transaction
   *     interactivo — el usuario perdía sus patrones mientras la categoría
   *     sobrevivía. Ese peligro ya no puede ocurrir: parent.count === 0 solo puede
   *     significar ausente/ajena, y en ambos casos el deleteMany hijo también
   *     matcheó 0 filas, porque PatronClasificacion tiene un composite FK
   *     (categoriaId, userId) → Categoria(id, userId) (ADR-036 D-06): una fila
   *     (categoriaId = id, userId = caller) no puede existir si no existe la
   *     Categoria (id, userId = caller). Cero padre ⇒ cero hijos, por constraint
   *     de base de datos.
   *
   *     INVARIANTE DEL QUE DEPENDE ESA PRUEBA: los DOS statements filtran por el
   *     MISMO userId. Sacar `userId` del WHERE hijo rompe el argumento y
   *     reintroduce el ataque documentado en PrismaEliminarIngestaRepository
   *     (A borra los patrones de B y recibe un 404 limpio). No lo saques.
   *
   * (3) Transaccion.categoriaId lo NULea la FK (onDelete: SetNull,
   *     schema.prisma:199), no código de aplicación — ver design.md §2/D-03.
   *     bucketId NO se toca: sigue siendo la fuente de verdad del 50/30/20, así
   *     que borrar una categoría NO mueve dinero (CAT038-04, CA-04).
   *
   * deleteMany (no delete) en el padre: el count ES el gate de ownership, así que
   * "no existe" y "no es tuya" quedan indistinguibles (anti-enumeration, CAT038-07).
   */
  async eliminar(
    userId: string,
    id: string,
  ): Promise<Result<void, CategoriaNoEncontradaError>> {
    const [, parent] = await this.prisma.$transaction([
      // (1) children FIRST — REQUIRED under the FK's default Restrict.
      this.prisma.patronClasificacion.deleteMany({
        where: { categoriaId: id, userId },
      }),
      // (2) parent — its count IS the ownership gate; the FK nulls Transaccion.categoriaId.
      this.prisma.categoria.deleteMany({ where: { id, userId } }),
    ]);

    if (parent.count === 0) {
      return Result.fail(new CategoriaNoEncontradaError(id));
    }
    return Result.ok(undefined);
  }
}
