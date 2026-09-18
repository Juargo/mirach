import type { PrismaClient } from '@prisma/client';
import { Bucket } from '../../domain/value-objects/bucket';
import type { MatchType } from '../../domain/value-objects/patron-clasificacion';
import type { IconoCategoria } from '../../domain/value-objects/icono-categoria';
import { BUCKET_IDS, BUCKET_ID_TO_BUCKET } from './bucket-ids';

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
 * sigue dando en este cambio: `CategoriaTemplateClave` (par `bucket:nombre`,
 * ADR-042) fija el universo de claves que `PATRON_TEMPLATE.categoria` puede
 * referenciar. Sobre datos de usuario ninguna prueba de compilación es
 * posible (la identidad es una fila, no un tipo) — ver ADR-037.
 *
 * `CATEGORIA_IDS` (categoria-ids.ts) sigue siendo la fuente de ids fijos,
 * pero solo el seed la consulta — ningún runtime path la necesita para
 * escribir.
 */

/**
 * Fila de categoría de la plantilla — carga `bucket: Bucket`; `bucketId` se
 * resuelve vía `BUCKET_IDS[bucket]` en cada write site, nunca literal
 * (CAT-01, D-02). `icono` es el default seed de cada categoría
 * (categoria-iconografia, ADR-045 D-06/D-09) — un nombre lucide kebab-case
 * de `ICONOS_CATEGORIA`, copiado verbatim por AMBOS escritores
 * (`copiarCatalogoTemplate` y `prisma/seed.ts`) al materializar un catálogo
 * NUEVO; nunca backfillea una fila `Categoria` ya existente.
 */
export const CATEGORIA_TEMPLATE = [
  {
    nombre: 'Supermercado',
    bucket: Bucket.Necesidades,
    icono: 'shopping-cart',
  },
  { nombre: 'Combustible', bucket: Bucket.Necesidades, icono: 'fuel' },
  { nombre: 'Farmacia', bucket: Bucket.Necesidades, icono: 'pill' },
  { nombre: 'Salud', bucket: Bucket.Necesidades, icono: 'heart-pulse' },
  { nombre: 'Transporte', bucket: Bucket.Necesidades, icono: 'bus' },
  { nombre: 'Streaming', bucket: Bucket.Deseos, icono: 'tv' },
  { nombre: 'Delivery', bucket: Bucket.Deseos, icono: 'bike' },
  { nombre: 'Ahorro', bucket: Bucket.Ahorro, icono: 'piggy-bank' },
  {
    nombre: 'Deuda',
    bucket: Bucket.Necesidades,
    icono: 'credit-card',
  },
] as const satisfies ReadonlyArray<{
  nombre: string;
  bucket: Bucket;
  icono: IconoCategoria;
}>;

/**
 * assertSinParesDuplicados — ADR-042 D-11.
 *
 * ADR-042 mueve la unicidad de `Categoria` de `(userId, nombre)` a
 * `(userId, bucketId, nombre)`: dos categorías del MISMO usuario PUEDEN
 * compartir nombre en buckets distintos — eso ya no es un error, es un caso
 * válido que la BD permite explícitamente. Lo que sigue sin ser válido es
 * repetir el MISMO par `(bucket, nombre)` dos veces dentro de la plantilla:
 * `copiarCatalogoTemplate`'s `idPorClave` map (más abajo) queda keyed por
 * `(bucket, nombre)` — si `CATEGORIA_TEMPLATE` alguna vez repitiera un par
 * completo, `idPorClave` resolvería "la última fila que escribió esa clave"
 * (last-write-wins) para CUALQUIER entrada de `PATRON_TEMPLATE` que
 * referencie esa clave, adjuntando patrones a la categoría equivocada para
 * cada usuario nuevo, en silencio. Este guard exige que el UNIVERSO de pares
 * `(bucket, nombre)` de la plantilla sea único — exactamente el invariante
 * de BD de ADR-042, verificado en memoria antes de escribir una sola fila.
 *
 * Extraída como función nombrada (en vez de un `if` inline a nivel de
 * módulo) para que sea unit-testable sin depender del side-effect de
 * importar el módulo.
 */
export function assertSinParesDuplicados(
  template: ReadonlyArray<{ nombre: string; bucket: string }>,
): void {
  const claves = template.map((c) => `${c.bucket}:${c.nombre}`);
  if (new Set(claves).size !== claves.length) {
    throw new Error(
      'CATEGORIA_TEMPLATE tiene un par repetido (mismo bucket + nombre): ' +
        're-keyea idPorClave por (bucket, nombre) antes de agregarlo ' +
        '(ADR-042).',
    );
  }
}

// ADR-042 permite el mismo nombre en dos buckets, pero prohíbe repetir el
// MISMO par (bucket, nombre) — falla en el momento de importar si alguna vez
// se agrega uno (ver el docblock de assertSinParesDuplicados).
assertSinParesDuplicados(CATEGORIA_TEMPLATE);

/**
 * Universo cerrado de nombres de la plantilla semilla — la única prueba de
 * compilación que ADR-037 conserva. Sigue viva porque `prisma/seed.ts`
 * (`CATEGORIA_CATALOG`) tipa la columna `nombre` de cada fila contra ella;
 * para referenciar una categoría sin ambigüedad (ids fijos, `PATRON_TEMPLATE`)
 * usar `CategoriaTemplateClave` en su lugar (abajo).
 */
export type CategoriaTemplateNombre =
  (typeof CATEGORIA_TEMPLATE)[number]['nombre'];

/**
 * ClaveDe<T> — deriva el universo cerrado de claves compuestas
 * `${bucket}:${nombre}` de un array `as const` de filas `{ bucket, nombre }`.
 *
 * Al ser `T` un parámetro de tipo "desnudo" en la posición chequeada del
 * condicional, TypeScript lo distribuye sobre la UNIÓN de las 9 filas
 * literales de `CATEGORIA_TEMPLATE` — cada rama infiere `B`/`N` de la MISMA
 * fila, así que el resultado es el universo de PARES REALES, nunca el
 * producto cartesiano de todos los buckets con todos los nombres.
 */
type ClaveDe<T> = T extends {
  bucket: infer B extends string;
  nombre: infer N extends string;
}
  ? `${B}:${N}`
  : never;

/**
 * Universo cerrado de pares (bucket, nombre) de la plantilla — ADR-042.
 * `PATRON_TEMPLATE.categoria` y `CATEGORIA_IDS` se re-tipan contra esta
 * unión: referenciar una categoría exige decir de qué bucket, por
 * construcción, así que dos categorías homónimas en buckets distintos dejan
 * de ser ambiguas para cualquier consumidor tipado.
 */
export type CategoriaTemplateClave = ClaveDe<
  (typeof CATEGORIA_TEMPLATE)[number]
>;

/**
 * claveCategoria — única forma soportada de construir una
 * `CategoriaTemplateClave` en un write site; evita que cada call site
 * concatene `${bucket}:${nombre}` a mano y diverja del formato (ADR-042).
 * Devuelve `string` (no la unión literal) porque los call sites en runtime
 * (`copiarCatalogoTemplate`'s `idPorClave`, tests) construyen la clave desde
 * datos leídos de la BD o iterados dinámicamente, que TypeScript no puede
 * correlacionar de vuelta a una fila literal específica de la plantilla —
 * un call site que necesite indexar un `Record<CategoriaTemplateClave, _>`
 * con el resultado debe castear explícitamente, sabiendo que el valor viene
 * de la misma plantilla.
 */
export function claveCategoria(bucket: Bucket, nombre: string): string {
  return `${bucket}:${nombre}`;
}

/** Derivado del array — no puede desincronizarse en silencio de los tests. */
export const CATEGORIA_TEMPLATE_SIZE = CATEGORIA_TEMPLATE.length;

/**
 * Catálogo chileno de patrones (mismo contenido que el histórico
 * `PATRON_CATALOG` de `prisma/seed.ts`, sin ids físicos — `categoria` es la
 * clave compuesta `${bucket}:${nombre}` (ADR-042; `CategoriaTemplateClave`)
 * de la fila de plantilla que referencia, resuelta a un id real por cada
 * escritor en el momento de escribir. Nunca solo `nombre`: eso sería
 * ambiguo el día que dos categorías compartan nombre en buckets distintos).
 *
 * `as const satisfies` en vez de una anotación de tipo, por la misma razón
 * que `CATEGORIA_TEMPLATE`: `satisfies` sigue validando cada entrada contra
 * la forma esperada, pero `as const` conserva el TEXTO de cada patrón como
 * tipo literal en vez de colapsarlo a `string`. Eso es lo que hace posible
 * `PatronTemplateTexto` (abajo) y, con él, que `PATRON_ID_FIJO` en
 * `prisma/seed.ts` sea total: agregar un patrón acá sin darle su id fijo
 * rompe `tsc`, en vez de producir `id: undefined` en silencio.
 */
export const PATRON_TEMPLATE = [
  // ── Necesidades (alimentos, transporte, salud, servicios básicos) ──
  {
    patron: 'lider',
    matchType: 'CONTAINS',
    categoria: 'Necesidades:Supermercado',
    prioridad: 10,
  },
  {
    patron: 'jumbo',
    matchType: 'CONTAINS',
    categoria: 'Necesidades:Supermercado',
    prioridad: 10,
  },
  {
    patron: 'unimarc',
    matchType: 'CONTAINS',
    categoria: 'Necesidades:Supermercado',
    prioridad: 10,
  },
  {
    patron: 'santa isabel',
    matchType: 'CONTAINS',
    categoria: 'Necesidades:Supermercado',
    prioridad: 10,
  },
  {
    patron: 'tottus',
    matchType: 'CONTAINS',
    categoria: 'Necesidades:Supermercado',
    prioridad: 10,
  },
  {
    patron: 'copec',
    matchType: 'CONTAINS',
    categoria: 'Necesidades:Combustible',
    prioridad: 15,
  },
  {
    patron: 'shell',
    matchType: 'CONTAINS',
    categoria: 'Necesidades:Combustible',
    prioridad: 15,
  },
  {
    patron: 'farmacia',
    matchType: 'CONTAINS',
    categoria: 'Necesidades:Farmacia',
    prioridad: 20,
  },
  {
    patron: 'isapre',
    matchType: 'CONTAINS',
    categoria: 'Necesidades:Salud',
    prioridad: 20,
  },
  {
    patron: 'transantiago',
    matchType: 'CONTAINS',
    categoria: 'Necesidades:Transporte',
    prioridad: 20,
  },
  {
    patron: 'bip',
    matchType: 'CONTAINS',
    categoria: 'Necesidades:Transporte',
    prioridad: 25,
  },
  // Los dos patrones de `Deuda` se anclan en la subcadena SIN TILDES más
  // larga que sea inequívoca: `coincide()` normaliza a minúsculas pero NO
  // quita tildes, así que un patrón acentuado deja de matchear el día que el
  // banco escriba la misma glosa sin tilde (o al revés). Por eso se corta
  // antes de "crédito", y por eso `sobregiro` se usa solo, sin "línea" ni
  // "automático". Los últimos 4 dígitos de la tarjeta quedan fuera a
  // propósito: cambian al renovarla.
  {
    patron: 'pago deuda tarjeta',
    matchType: 'CONTAINS',
    categoria: 'Necesidades:Deuda',
    prioridad: 10,
  },
  // Cubre toda la glosa de sobregiro (pago automático, comisión, interés):
  // todas son servicio de la misma deuda y comparten bucket. Usar el uso de
  // la línea como ingreso NO es un riesgo: la regla de Ingreso de
  // CategorizarTransaccionUseCase corre antes que el catálogo, así que un
  // abono nunca llega a evaluarse contra estos patrones.
  {
    patron: 'sobregiro',
    matchType: 'CONTAINS',
    categoria: 'Necesidades:Deuda',
    prioridad: 10,
  },

  // ── Deseos (entretenimiento, restaurantes, suscripciones) ──
  {
    patron: 'netflix',
    matchType: 'CONTAINS',
    categoria: 'Deseos:Streaming',
    prioridad: 10,
  },
  {
    patron: 'spotify',
    matchType: 'CONTAINS',
    categoria: 'Deseos:Streaming',
    prioridad: 10,
  },
  {
    patron: 'prime video',
    matchType: 'CONTAINS',
    categoria: 'Deseos:Streaming',
    prioridad: 10,
  },
  {
    patron: 'uber eats',
    matchType: 'CONTAINS',
    categoria: 'Deseos:Delivery',
    prioridad: 15,
  },
  {
    patron: 'rappi',
    matchType: 'CONTAINS',
    categoria: 'Deseos:Delivery',
    prioridad: 15,
  },

  // ── Ahorro (transferencias a fintech / ahorro / inversión) ──
  {
    patron: 'fintual',
    matchType: 'CONTAINS',
    categoria: 'Ahorro:Ahorro',
    prioridad: 10,
  },
  {
    patron: 'cuenta ahorro',
    matchType: 'CONTAINS',
    categoria: 'Ahorro:Ahorro',
    prioridad: 20,
  },
  // AFP abreviada en cartola: "AFP ..." — STARTS_WITH para anclar y evitar false positives
  {
    patron: 'afp ',
    matchType: 'STARTS_WITH',
    categoria: 'Ahorro:Ahorro',
    prioridad: 15,
  },
  // Transferencia a cuenta propia o de ahorro: REGEX acotado
  {
    patron: '^transf(?:erencia)?.*ahorro',
    matchType: 'REGEX',
    categoria: 'Ahorro:Ahorro',
    prioridad: 25,
  },
] as const satisfies ReadonlyArray<{
  patron: string;
  matchType: MatchType;
  categoria: CategoriaTemplateClave;
  prioridad: number;
}>;

/**
 * Universo cerrado de TEXTOS de patrón — el gemelo de
 * `CategoriaTemplateNombre` para el lado de los patrones.
 *
 * Existe para que `PATRON_ID_FIJO` (`prisma/seed.ts`) pueda tiparse
 * `Record<PatronTemplateTexto, string>` y volverse TOTAL: el compilador
 * exige una entrada por patrón, y rechaza una entrada que no corresponda a
 * ningún patrón. Antes ese mapa era `Record<string, string>`, que acepta
 * cualquier clave y devuelve `string` aunque no exista — un patrón nuevo sin
 * su id entraba al seed como `id: undefined`, sin que `tsc` dijera nada.
 */
export type PatronTemplateTexto = (typeof PATRON_TEMPLATE)[number]['patron'];

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
      // Default seed del allowlist curado (ADR-045 D-06/D-09) — solo en la
      // creación de un catálogo NUEVO, nunca backfillea una fila existente.
      icono: categoria.icono,
    })),
  });

  // select trae `bucketId` (id FÍSICO) además de `id`/`nombre`: sin él no
  // hay forma de reconstruir la clave compuesta `bucket:nombre` de cada fila
  // recién creada, porque el bucket SEMÁNTICO no viaja de vuelta desde
  // Prisma. `BUCKET_ID_TO_BUCKET` (bucket-ids.ts) ya es la autoridad
  // inversa de `BUCKET_IDS` que el resto del código usa para ese mismo
  // problema (prisma-resumen-mes/anual) — reusarla acá evita inventar una
  // segunda inversión de `BUCKET_IDS` (DRY) y mantiene a `BUCKET_IDS` como
  // la ÚNICA autoridad de ids físicos de bucket (ADR-037 D-02).
  const categoriasCreadas = await tx.categoria.findMany({
    where: { userId },
    select: { id: true, nombre: true, bucketId: true },
  });
  const idPorClave = new Map<string, string>(
    categoriasCreadas.map((categoria) => {
      // bucket SIEMPRE resuelve: bucketId viene de BUCKET_IDS[categoria.bucket]
      // recién escrito arriba, en el mismo llamado — BUCKET_ID_TO_BUCKET es
      // su inversa exacta.
      const bucket = BUCKET_ID_TO_BUCKET.get(categoria.bucketId)!;
      return [claveCategoria(bucket, categoria.nombre), categoria.id];
    }),
  );

  await tx.patronClasificacion.createMany({
    data: PATRON_TEMPLATE.map((patron) => ({
      userId,
      patron: patron.patron,
      matchType: patron.matchType,
      // La clave siempre resuelve: viene de la misma CATEGORIA_TEMPLATE que
      // se acaba de escribir arriba, en el mismo llamado.
      categoriaId: idPorClave.get(patron.categoria)!,
      prioridad: patron.prioridad,
    })),
  });
}
