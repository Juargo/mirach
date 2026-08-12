import type { PrismaClient } from '@prisma/client';
import { Bucket } from '../../domain/value-objects/bucket';
import type { MatchType } from '../../domain/value-objects/patron-clasificacion';
import { BUCKET_IDS } from './bucket-ids';

/**
 * catalogo-template.ts — plantilla de catálogo de clasificación (US-037 D-01;
 * ADR-037 D-02).
 *
 * Fuente única de contenido (qué categorías, qué patrones, qué prioridades)
 * para AMBOS escritores del catálogo: `copiarCatalogoTemplate` (usuarios
 * nuevos, ids generados) y `prisma/seed.ts` (usuario bootstrap, ids fijos —
 * D-07). Deliberadamente vive en `src/` y no en `prisma/seed.ts`: el seed
 * importa Prisma adapters + dotenv + el gate db-safety, y arrastrar ese grafo
 * a código de runtime (el copy hook lo llama desde `PrismaDemoRepository`)
 * sería incorrecto (D-01).
 *
 * Tras ADR-037 (retiro del enum `Categoria`), la plantilla es un literal
 * `as const` — es la ÚNICA prueba de consistencia interna que el compilador
 * sigue dando en este cambio: `CategoriaTemplateNombre` fija el universo de
 * nombres que `PATRON_TEMPLATE.categoria` puede referenciar. Sobre datos de
 * usuario ninguna prueba de compilación es posible (la identidad es una fila,
 * no un tipo) — ver ADR-037.
 *
 * `CATEGORIA_IDS` (categoria-ids.ts) sigue siendo la fuente de ids fijos,
 * pero solo el seed la consulta — ningún runtime path la necesita para
 * escribir.
 */

/** Fila de categoría de la plantilla — carga `bucket: Bucket`; `bucketId` se resuelve vía `BUCKET_IDS[bucket]` en cada write site, nunca literal (CAT-01, D-02). */
export const CATEGORIA_TEMPLATE = [
  { nombre: 'Supermercado', bucket: Bucket.Necesidades },
  { nombre: 'Combustible', bucket: Bucket.Necesidades },
  { nombre: 'Farmacia', bucket: Bucket.Necesidades },
  { nombre: 'Salud', bucket: Bucket.Necesidades },
  { nombre: 'Transporte', bucket: Bucket.Necesidades },
  { nombre: 'Streaming', bucket: Bucket.Deseos },
  { nombre: 'Delivery', bucket: Bucket.Deseos },
  { nombre: 'Ahorro', bucket: Bucket.Ahorro },
] as const satisfies ReadonlyArray<{ nombre: string; bucket: Bucket }>;

/**
 * Universo cerrado de nombres de la plantilla semilla — la única prueba de
 * compilación que ADR-037 conserva. `PATRON_TEMPLATE.categoria` y
 * `CATEGORIA_IDS` se re-tipan contra esta unión.
 */
export type CategoriaTemplateNombre =
  (typeof CATEGORIA_TEMPLATE)[number]['nombre'];

/** Derivado del array — no puede desincronizarse en silencio de los tests. */
export const CATEGORIA_TEMPLATE_SIZE = CATEGORIA_TEMPLATE.length;

/**
 * Catálogo chileno de patrones (mismo contenido que el histórico
 * `PATRON_CATALOG` de `prisma/seed.ts`, sin ids físicos — `categoria` es el
 * nombre de la fila de plantilla, resuelto a un id real por cada escritor en
 * el momento de escribir).
 */
export const PATRON_TEMPLATE: ReadonlyArray<{
  readonly patron: string;
  readonly matchType: MatchType;
  readonly categoria: CategoriaTemplateNombre;
  readonly prioridad: number;
}> = [
  // ── Necesidades (alimentos, transporte, salud, servicios básicos) ──
  {
    patron: 'lider',
    matchType: 'CONTAINS',
    categoria: 'Supermercado',
    prioridad: 10,
  },
  {
    patron: 'jumbo',
    matchType: 'CONTAINS',
    categoria: 'Supermercado',
    prioridad: 10,
  },
  {
    patron: 'unimarc',
    matchType: 'CONTAINS',
    categoria: 'Supermercado',
    prioridad: 10,
  },
  {
    patron: 'santa isabel',
    matchType: 'CONTAINS',
    categoria: 'Supermercado',
    prioridad: 10,
  },
  {
    patron: 'tottus',
    matchType: 'CONTAINS',
    categoria: 'Supermercado',
    prioridad: 10,
  },
  {
    patron: 'copec',
    matchType: 'CONTAINS',
    categoria: 'Combustible',
    prioridad: 15,
  },
  {
    patron: 'shell',
    matchType: 'CONTAINS',
    categoria: 'Combustible',
    prioridad: 15,
  },
  {
    patron: 'farmacia',
    matchType: 'CONTAINS',
    categoria: 'Farmacia',
    prioridad: 20,
  },
  {
    patron: 'isapre',
    matchType: 'CONTAINS',
    categoria: 'Salud',
    prioridad: 20,
  },
  {
    patron: 'transantiago',
    matchType: 'CONTAINS',
    categoria: 'Transporte',
    prioridad: 20,
  },
  {
    patron: 'bip',
    matchType: 'CONTAINS',
    categoria: 'Transporte',
    prioridad: 25,
  },

  // ── Deseos (entretenimiento, restaurantes, suscripciones) ──
  {
    patron: 'netflix',
    matchType: 'CONTAINS',
    categoria: 'Streaming',
    prioridad: 10,
  },
  {
    patron: 'spotify',
    matchType: 'CONTAINS',
    categoria: 'Streaming',
    prioridad: 10,
  },
  {
    patron: 'prime video',
    matchType: 'CONTAINS',
    categoria: 'Streaming',
    prioridad: 10,
  },
  {
    patron: 'uber eats',
    matchType: 'CONTAINS',
    categoria: 'Delivery',
    prioridad: 15,
  },
  {
    patron: 'rappi',
    matchType: 'CONTAINS',
    categoria: 'Delivery',
    prioridad: 15,
  },

  // ── Ahorro (transferencias a fintech / ahorro / inversión) ──
  {
    patron: 'fintual',
    matchType: 'CONTAINS',
    categoria: 'Ahorro',
    prioridad: 10,
  },
  {
    patron: 'cuenta ahorro',
    matchType: 'CONTAINS',
    categoria: 'Ahorro',
    prioridad: 20,
  },
  // AFP abreviada en cartola: "AFP ..." — STARTS_WITH para anclar y evitar false positives
  {
    patron: 'afp ',
    matchType: 'STARTS_WITH',
    categoria: 'Ahorro',
    prioridad: 15,
  },
  // Transferencia a cuenta propia o de ahorro: REGEX acotado
  {
    patron: '^transf(?:erencia)?.*ahorro',
    matchType: 'REGEX',
    categoria: 'Ahorro',
    prioridad: 25,
  },
];

/** Derivado del array — no puede desincronizarse en silencio de los tests. */
export const PATRON_TEMPLATE_SIZE = PATRON_TEMPLATE.length;

/**
 * Cliente estructural mínimo que `copiarCatalogoTemplate` necesita: acepta
 * tanto un `PrismaClient` normal como un `tx` de `$transaction` — ambos
 * exponen `categoria`/`patronClasificacion` con la misma forma. `Pick<>`
 * en vez de `Prisma.TransactionClient` (ISP): más angosto, y un fake escrito
 * a mano en un test unitario lo satisface sin stubbear el cliente completo.
 */
export type CatalogoTemplateClient = Pick<
  PrismaClient,
  'categoria' | 'patronClasificacion'
>;

/**
 * copiarCatalogoTemplate — materializa la plantilla como filas propias de
 * `userId` (US-037 D-01/D-02/D-07).
 *
 * Contrato (design.md §3 — el apply phase no puede violar ninguna regla):
 *   1. El caller es dueño del límite transaccional: esta función NUNCA abre
 *      su propio `$transaction` — Prisma prohíbe anidar una transacción
 *      interactiva dentro de otra, y el call site de demo NECESITA que la
 *      copia quede inscrita en su transacción existente.
 *   2. LANZA en caso de fallo — no retorna `Result`. La regla `Result<T,E>`
 *      rige domain/application (ADR-005); esto es un helper de persistencia
 *      cuyo fallo debe hacer rollback de la transacción envolvente, y el
 *      único mecanismo que logra eso en Prisma es un throw.
 *   3. NO es idempotente — una llamada por usuario nuevo. El usuario
 *      bootstrap se sirve por el upsert propio del seed (D-07).
 *   4. `userId` viaja como parámetro, nunca como estado de constructor — un
 *      repositorio es un singleton compartido entre requests.
 *
 * Dos round-trips de escritura + una lectura, no 28 statements.
 */
export async function copiarCatalogoTemplate(
  tx: CatalogoTemplateClient,
  userId: string,
): Promise<void> {
  await tx.categoria.createMany({
    data: CATEGORIA_TEMPLATE.map((categoria) => ({
      userId,
      nombre: categoria.nombre,
      // bucketId SIEMPRE derivado en el write site — BUCKET_IDS sigue siendo
      // la única autoridad de ids físicos (ADR-037 D-02).
      bucketId: BUCKET_IDS[categoria.bucket],
    })),
  });

  const categoriasCreadas = await tx.categoria.findMany({
    where: { userId },
    select: { id: true, nombre: true },
  });
  const idPorNombre = new Map<string, string>(
    categoriasCreadas.map((categoria) => [categoria.nombre, categoria.id]),
  );

  await tx.patronClasificacion.createMany({
    data: PATRON_TEMPLATE.map((patron) => ({
      userId,
      patron: patron.patron,
      matchType: patron.matchType,
      // El nombre siempre resuelve: viene de la misma CATEGORIA_TEMPLATE que
      // se acaba de escribir arriba, en el mismo llamado.
      categoriaId: idPorNombre.get(patron.categoria)!,
      prioridad: patron.prioridad,
    })),
  });
}
