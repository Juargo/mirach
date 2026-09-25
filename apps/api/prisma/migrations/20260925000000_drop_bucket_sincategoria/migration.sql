-- Issue #778 tramo 5b PR 6: retira el remanente físico de `Bucket.SinCategoria`
-- (removido del dominio y del contrato HTTP en tramo 5b PR5, `bucket-ids.ts`).
--
-- Hasta esta migración, `resolverBucket`/`construirFiltroBucket` plegaban en
-- LECTURA el id físico legacy 'bucket-sincategoria' a `Bucket.Deseos` (además
-- de `bucketId IS NULL`). Esta migración hace ese pliegue PERMANENTE en la
-- columna: reescribe cada fila con ese id físico a `bucket-deseos` y borra la
-- fila `BucketPresupuesto` — después de esto ya no puede EXISTIR una fila con
-- ese id (la FK de Transaccion.bucketId lo impide).
--
-- `bucketId IS NULL` NUNCA se toca acá (riesgo residual documentado de
-- `ProcessIngestaUseCase.revertirYRechazar` — sigue plegando en lectura, no
-- es lo mismo que SinCategoria).
--
-- ── Paso 1: mover la plata ───────────────────────────────────────────────
--
-- Cada Transaccion con bucketId = 'bucket-sincategoria' pasa a bucketId =
-- 'bucket-deseos'. Si la fila no tenía categoriaId (el caso típico, ya que
-- SinCategoria nunca tuvo categorías propias — BUCKETS_ASIGNABLES la excluye
-- como destino), se le asigna la Desconocido INTERNA (esInterna = true) de
-- Deseos DEL MISMO usuario dueño de la cuenta — nunca de otro usuario
-- (RNF-SEC-006): el join ata Transaccion → Account → userId → Categoria por
-- ese MISMO userId, vía subquery CORRELACIONADA (no un JOIN suelto, para que
-- Postgres no pueda multiplicar filas si, por integridad de datos anómala,
-- un usuario tuviera más de una fila marcada esInterna=true en Deseos —
-- LIMIT 1 es la misma defensa que `seleccionarCategoriaInterna`: "no debería
-- pasar, pero si pasa, no lanza ni multiplica, toma la primera").
--
-- Si el usuario dueño NO tiene esa Desconocido marcada (catálogo legacy sin
-- `marcar-categorias-internas.ts` corrido), `categoriaId` queda NULL — el
-- read-model ya sabe leer una fila con bucket asignado y categoriaId nulo
-- como "Sin categoría" a nivel de categoría (ver
-- agrupar-detalle-por-categoria.ts), que es exactamente lo que ya mostraba
-- resolverBucket() en lectura antes de esta migración. Nunca se inventa una
-- categoría ni se bloquea la migración de bucket por esto.
--
-- Una fila que YA tenía categoriaId (no debería existir — SinCategoria nunca
-- fue un destino de categorización real — pero si existiera por integridad
-- de datos anómala) conserva su categoriaId intacto vía COALESCE: esta
-- migración NUNCA pisa una categoría ya asignada.
--
-- @migration-step: update-transacciones (marcador leído por
-- test/drop-bucket-sincategoria-migration.int-spec.ts para ejecutar/probar
-- este paso por separado — no lo muevas ni lo borres sin actualizar ese test)
UPDATE "Transaccion" AS t
SET
  "categoriaId" = COALESCE(
    t."categoriaId",
    (
      SELECT c."id"
      FROM "Categoria" c
      INNER JOIN "Account" acc ON acc."id" = t."accountId"
      WHERE c."userId" = acc."userId"
        AND c."bucketId" = 'bucket-deseos'
        AND c."esInterna" = true
      LIMIT 1
    )
  ),
  "bucketId" = 'bucket-deseos'
WHERE t."bucketId" = 'bucket-sincategoria';

-- ── Guardia: fallar ruidoso, nunca plata orfanada en silencio ────────────
--
-- La FK real `Transaccion_bucketId_fkey` es `ON DELETE SET NULL` (histórica,
-- ver 20260711062124_add_categorizacion_buckets) — si el UPDATE de arriba,
-- por lo que sea, dejara una fila SIN migrar y el DROP de abajo la borrara
-- igual, esa fila perdería su bucket SILENCIOSAMENTE (bucketId → NULL) en vez
-- de fallar. Esta migración NUNCA debe confiar en ese SET NULL para dinero:
-- se verifica explícitamente que cero filas sigan apuntando al id legacy
-- ANTES de intentar el DROP, y se aborta la migración completa (ROLLBACK)
-- si no es así.
--
-- @migration-step: guard-filas-restantes (mismo marcador que arriba)
DO $$
DECLARE
  filas_restantes integer;
BEGIN
  SELECT COUNT(*) INTO filas_restantes
  FROM "Transaccion"
  WHERE "bucketId" = 'bucket-sincategoria';

  IF filas_restantes > 0 THEN
    RAISE EXCEPTION
      'drop_bucket_sincategoria: % fila(s) de Transaccion siguen con bucketId = ''bucket-sincategoria'' después del UPDATE — abortando ANTES del DROP de BucketPresupuesto para no perder el bucket en silencio via ON DELETE SET NULL',
      filas_restantes;
  END IF;
END $$;

-- ── Paso 2: borrar la fila BucketPresupuesto ──────────────────────────────
--
-- `Categoria.bucketId` → `BucketPresupuesto.id` es `ON DELETE RESTRICT`
-- (20260719000000_add_categoria_model): si alguna Categoria referenciara
-- todavía 'bucket-sincategoria' (no debería — BUCKETS_ASIGNABLES nunca la
-- incluyó como bucket asignable de una categoría real), este DELETE falla
-- ruidoso con un error de FK en vez de arrastrarla. No hace falta un guard
-- explícito adicional para Categoria: RESTRICT ya es fail-loud por
-- construcción.
--
-- Idempotente: si esta migración corre sobre una BD donde la fila ya no
-- existe (o nunca tuvo transacciones legacy), el UPDATE de arriba no
-- encuentra filas, el guard pasa con 0, y este DELETE afecta 0 filas sin
-- error.
--
-- @migration-step: delete-bucket (mismo marcador que arriba)
DELETE FROM "BucketPresupuesto" WHERE "id" = 'bucket-sincategoria';
