import { describe, it, expect } from 'vitest';
import {
  CATEGORIA_TEMPLATE,
  PATRON_TEMPLATE,
  claveCategoria,
} from './catalogo-template';
import { Bucket } from '../../domain/value-objects/bucket';
import { PatronClasificacion } from '../../domain/value-objects/patron-clasificacion';
import { CategorizarTransaccionUseCase } from '../../application/use-cases/categorizar-transaccion.use-case';
import { NoOpLogger } from '../../../test/support/logger.double';

/**
 * Regresión glosa → categoría (issue #746).
 *
 * Ejercita `CategorizarTransaccionUseCase` con el `PATRON_TEMPLATE` REAL
 * (no un catálogo de juguete) para que:
 *   1. Los patrones nuevos (Cuentas, Internet y telefonía) clasifiquen las
 *      glosas chilenas esperadas.
 *   2. Ningún patrón nuevo cambie la categoría de una glosa que un patrón
 *      YA EXISTENTE clasificaba antes de este cambio — el pin de esta tabla
 *      es la prueba de no-regresión pedida por el owner.
 *   3. Los tokens endurecidos (`claro chile`, `\bwom\b`) rechazan el falso
 *      positivo que motivó endurecerlos en vez de agregarlos crudos.
 */
const CATEGORIA_POR_CLAVE = new Map<
  string,
  { id: string; nombre: string; bucket: Bucket }
>(
  CATEGORIA_TEMPLATE.map((entry) => {
    const clave = claveCategoria(entry.bucket, entry.nombre);
    return [clave, { id: clave, nombre: entry.nombre, bucket: entry.bucket }];
  }),
);

const PATRONES_REALES: readonly PatronClasificacion[] = PATRON_TEMPLATE.map(
  (entry, index) =>
    new PatronClasificacion({
      id: `patron-${index}`,
      patron: entry.patron,
      matchType: entry.matchType,
      categoria: CATEGORIA_POR_CLAVE.get(entry.categoria)!,
      prioridad: entry.prioridad,
    }),
);

const useCase = new CategorizarTransaccionUseCase(new NoOpLogger());

/**
 * `SIN_MATCH` — sentinel LOCAL a este test, no un `Bucket` del dominio
 * (issue #778 tramo 5b PR5 removió `Bucket.SinCategoria`). Esta tabla es un
 * pin de glosa→categoría/bucket (issue #746) y necesita distinguir, en el
 * `bucket` esperado por caso, "ningún patrón matcheó" de un bucket real —
 * `CategorizarTransaccionUseCase` ya no devuelve ese centinela (#801), así
 * que la traducción vive ACÁ, local a este test.
 */
const SIN_MATCH = 'sin-match' as const;

function clasificar(descripcion: string) {
  const value = useCase
    .execute({ descripcion, abono: 0n, cargo: 5000n }, PATRONES_REALES, null)
    .getValue();
  return {
    categoria:
      value.tipo === 'clasificada' ? (value.categoria?.nombre ?? null) : null,
    bucket: value.tipo === 'clasificada' ? value.bucket : SIN_MATCH,
  };
}

const CASOS: ReadonlyArray<{
  glosa: string;
  categoria: string | null;
  bucket: Bucket | typeof SIN_MATCH;
}> = [
  // ── Existentes — pin de no-regresión: deben seguir resolviendo igual ──
  {
    glosa: 'COMPRA LIDER EXPRESS',
    categoria: 'Supermercado',
    bucket: Bucket.Necesidades,
  },
  {
    glosa: 'COMPRA JUMBO LAS CONDES',
    categoria: 'Supermercado',
    bucket: Bucket.Necesidades,
  },
  {
    glosa: 'UNIMARC VITACURA',
    categoria: 'Supermercado',
    bucket: Bucket.Necesidades,
  },
  {
    glosa: 'SANTA ISABEL NUNOA',
    categoria: 'Supermercado',
    bucket: Bucket.Necesidades,
  },
  {
    glosa: 'TOTTUS MAIPU',
    categoria: 'Supermercado',
    bucket: Bucket.Necesidades,
  },
  {
    glosa: 'COPEC RUTA 5',
    categoria: 'Combustible',
    bucket: Bucket.Necesidades,
  },
  {
    glosa: 'SHELL LAS CONDES',
    categoria: 'Combustible',
    bucket: Bucket.Necesidades,
  },
  {
    glosa: 'FARMACIA AHUMADA',
    categoria: 'Farmacia',
    bucket: Bucket.Necesidades,
  },
  { glosa: 'ISAPRE CONSALUD', categoria: 'Salud', bucket: Bucket.Necesidades },
  {
    glosa: 'TRANSANTIAGO RECARGA',
    categoria: 'Transporte',
    bucket: Bucket.Necesidades,
  },
  {
    glosa: 'BIP RECARGA METRO',
    categoria: 'Transporte',
    bucket: Bucket.Necesidades,
  },
  {
    glosa: 'PAGO DEUDA TARJETA VISA',
    categoria: 'Deuda',
    bucket: Bucket.Necesidades,
  },
  {
    glosa: 'SOBREGIRO CTA CTE',
    categoria: 'Deuda',
    bucket: Bucket.Necesidades,
  },
  { glosa: 'NETFLIX.COM', categoria: 'Streaming', bucket: Bucket.Deseos },
  { glosa: 'SPOTIFY PREMIUM', categoria: 'Streaming', bucket: Bucket.Deseos },
  { glosa: 'PRIME VIDEO CL', categoria: 'Streaming', bucket: Bucket.Deseos },
  { glosa: 'UBER EATS SANTIAGO', categoria: 'Delivery', bucket: Bucket.Deseos },
  { glosa: 'RAPPI CHILE', categoria: 'Delivery', bucket: Bucket.Deseos },
  { glosa: 'FINTUAL SPA', categoria: 'Ahorro', bucket: Bucket.Ahorro },
  {
    glosa: 'TRANSFERENCIA A CUENTA AHORRO',
    categoria: 'Ahorro',
    bucket: Bucket.Ahorro,
  },
  { glosa: 'AFP CAPITAL', categoria: 'Ahorro', bucket: Bucket.Ahorro },

  // ── Cuentas (servicios básicos) — issue #746 ──
  {
    glosa: 'ENEL DISTRIBUCION',
    categoria: 'Cuentas',
    bucket: Bucket.Necesidades,
  },
  {
    glosa: 'CGE DISTRIBUCION',
    categoria: 'Cuentas',
    bucket: Bucket.Necesidades,
  },
  {
    glosa: 'CHILQUINTA ENERGIA',
    categoria: 'Cuentas',
    bucket: Bucket.Necesidades,
  },
  { glosa: 'SAESA LUZ', categoria: 'Cuentas', bucket: Bucket.Necesidades },
  {
    glosa: 'AGUAS ANDINAS SA',
    categoria: 'Cuentas',
    bucket: Bucket.Necesidades,
  },
  {
    glosa: 'ESVAL AGUA POTABLE',
    categoria: 'Cuentas',
    bucket: Bucket.Necesidades,
  },
  { glosa: 'ESSBIO SA', categoria: 'Cuentas', bucket: Bucket.Necesidades },
  { glosa: 'METROGAS SA', categoria: 'Cuentas', bucket: Bucket.Necesidades },
  {
    glosa: 'LIPIGAS A DOMICILIO',
    categoria: 'Cuentas',
    bucket: Bucket.Necesidades,
  },
  {
    glosa: 'ABASTIBLE GAS LICUADO',
    categoria: 'Cuentas',
    bucket: Bucket.Necesidades,
  },
  { glosa: 'GASCO GLP', categoria: 'Cuentas', bucket: Bucket.Necesidades },

  // ── Internet y telefonía — issue #746 ──
  {
    glosa: 'MOVISTAR CHILE',
    categoria: 'Internet y telefonía',
    bucket: Bucket.Necesidades,
  },
  {
    glosa: 'ENTEL PCS',
    categoria: 'Internet y telefonía',
    bucket: Bucket.Necesidades,
  },
  {
    glosa: 'VTR BANDA ANCHA',
    categoria: 'Internet y telefonía',
    bucket: Bucket.Necesidades,
  },
  {
    glosa: 'GTD MANQUEHUE',
    categoria: 'Internet y telefonía',
    bucket: Bucket.Necesidades,
  },
  {
    glosa: 'CLARO CHILE S.A.',
    categoria: 'Internet y telefonía',
    bucket: Bucket.Necesidades,
  },
  {
    glosa: 'PAGO WOM S.A.',
    categoria: 'Internet y telefonía',
    bucket: Bucket.Necesidades,
  },
  {
    glosa: 'COMPRA WOM TIENDA',
    categoria: 'Internet y telefonía',
    bucket: Bucket.Necesidades,
  },

  // ── Negativos: los tokens endurecidos NO deben matchear como substring ──
  { glosa: 'ESTA CLARO QUE SI', categoria: null, bucket: SIN_MATCH },
  {
    glosa: 'PAGO ANTEWOM SERVICIOS',
    categoria: null,
    bucket: SIN_MATCH,
  },

  // ── Comida / Ropa: sin patrones — nunca deben aparecer como resultado ──
  {
    glosa: 'RESTAURANT DONDE AUGUSTO',
    categoria: null,
    bucket: SIN_MATCH,
  },
  {
    glosa: 'TIENDA FALABELLA ROPA',
    categoria: null,
    bucket: SIN_MATCH,
  },

  // ── Genérico sin match ──
  {
    glosa: 'COMPRA VARIOS XYZ123',
    categoria: null,
    bucket: SIN_MATCH,
  },
];

describe('CategorizarTransaccionUseCase + PATRON_TEMPLATE real — tabla glosa→categoría (issue #746)', () => {
  it.each(CASOS)(
    '"$glosa" → categoria=$categoria, bucket=$bucket',
    ({ glosa, categoria, bucket }) => {
      expect(clasificar(glosa)).toEqual({ categoria, bucket });
    },
  );
});
