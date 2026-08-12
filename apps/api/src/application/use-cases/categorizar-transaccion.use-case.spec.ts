import { CategorizarTransaccionUseCase } from './categorizar-transaccion.use-case';
import { PatronClasificacion } from '../../domain/value-objects/patron-clasificacion';
import { Bucket } from '../../domain/value-objects/bucket';
import { Categoria } from '../../domain/value-objects/categoria';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makePatron(
  patron: string,
  matchType: PatronClasificacion['matchType'],
  categoria: Categoria,
  prioridad: number,
  id = `p-${patron}-${prioridad}`,
): PatronClasificacion {
  return new PatronClasificacion({
    id,
    patron,
    matchType,
    categoria,
    prioridad,
  });
}

const useCase = new CategorizarTransaccionUseCase();

// ---------------------------------------------------------------------------
// T05 — Regla Ingreso: boundaries (SC-01..SC-04)
// ---------------------------------------------------------------------------
describe('CategorizarTransaccionUseCase — regla Ingreso', () => {
  it('SC-01: abono > 0 y cargo = 0 → { categoria: null, bucket: Ingreso } (con catálogo vacío)', () => {
    const result = useCase.execute(
      { descripcion: 'ABONO SUELDO', abono: 15000n, cargo: 0n },
      [],
    );
    expect(result.isOk()).toBe(true);
    expect(result.getValue().categoria).toBeNull();
    expect(result.getValue().bucket).toBe(Bucket.Ingreso);
  });

  it('SC-01 variante: abono > 0 y cargo = 0 → Ingreso (con patrones no vacíos)', () => {
    const patrones = [makePatron('sueldo', 'CONTAINS', Categoria.Streaming, 1)];
    const result = useCase.execute(
      { descripcion: 'ABONO SUELDO', abono: 15000n, cargo: 0n },
      patrones,
    );
    expect(result.isOk()).toBe(true);
    expect(result.getValue().categoria).toBeNull();
    expect(result.getValue().bucket).toBe(Bucket.Ingreso);
  });

  it('SC-02: abono > 0 pero cargo > 0 → NO Ingreso, cae a SinCategoria (catálogo vacío)', () => {
    const result = useCase.execute(
      { descripcion: 'TRANSFERENCIA MIXTA', abono: 15000n, cargo: 500n },
      [],
    );
    expect(result.isOk()).toBe(true);
    expect(result.getValue().categoria).toBeNull();
    expect(result.getValue().bucket).toBe(Bucket.SinCategoria);
  });

  it('SC-03: abono = 0 y cargo = 0 → NO Ingreso, cae a SinCategoria (catálogo vacío)', () => {
    const result = useCase.execute(
      { descripcion: 'SIN MOVIMIENTO', abono: 0n, cargo: 0n },
      [],
    );
    expect(result.isOk()).toBe(true);
    expect(result.getValue().categoria).toBeNull();
    expect(result.getValue().bucket).toBe(Bucket.SinCategoria);
  });

  it('SC-04: abono = 0 y cargo > 0 → NO Ingreso, cae a SinCategoria (catálogo vacío)', () => {
    const result = useCase.execute(
      { descripcion: 'COMPRA LIDER', abono: 0n, cargo: 8000n },
      [],
    );
    expect(result.isOk()).toBe(true);
    expect(result.getValue().categoria).toBeNull();
    expect(result.getValue().bucket).toBe(Bucket.SinCategoria);
  });

  it('regla Ingreso gana sin importar los patrones: incluso si un patrón coincide, es Ingreso (sin categoría)', () => {
    const patrones = [makePatron('sueldo', 'CONTAINS', Categoria.Ahorro, 1)];
    const result = useCase.execute(
      { descripcion: 'DEPOSITO SUELDO', abono: 500000n, cargo: 0n },
      patrones,
    );
    expect(result.getValue().categoria).toBeNull();
    expect(result.getValue().bucket).toBe(Bucket.Ingreso);
  });
});

// ---------------------------------------------------------------------------
// T06 — Tipos de coincidencia, prioridad, SinCategoria, matcher-never-throws (SC-05..SC-14)
// CAT-03: un match persiste la categoría del patrón; el bucket es el derivado
// de esa categoría (patron.bucket, getter de PatronClasificacion).
// ---------------------------------------------------------------------------
describe('CategorizarTransaccionUseCase — coincidencia y prioridad', () => {
  it('SC-05: CONTAINS coincide cuando el patrón aparece como substring → persiste la categoría matcheada', () => {
    const patrones = [
      makePatron('LIDER', 'CONTAINS', Categoria.Supermercado, 10),
    ];
    const result = useCase.execute(
      { descripcion: 'COMPRA LIDER SAN PABLO 123', abono: 0n, cargo: 9500n },
      patrones,
    );
    expect(result.getValue().categoria).toBe(Categoria.Supermercado);
    expect(result.getValue().bucket).toBe(Bucket.Necesidades);
  });

  it('SC-06: CONTAINS es insensible a mayúsculas (descripción UPPERCASE, patrón lowercase)', () => {
    const patrones = [
      makePatron('netflix', 'CONTAINS', Categoria.Streaming, 20),
    ];
    const result = useCase.execute(
      { descripcion: 'SUSCRIPCION NETFLIX', abono: 0n, cargo: 5000n },
      patrones,
    );
    expect(result.getValue().categoria).toBe(Categoria.Streaming);
    expect(result.getValue().bucket).toBe(Bucket.Deseos);
  });

  it('SC-07: STARTS_WITH coincide cuando la descripción empieza con el patrón', () => {
    const patrones = [
      makePatron('COPEC', 'STARTS_WITH', Categoria.Combustible, 15),
    ];
    const result = useCase.execute(
      { descripcion: 'COPEC ESTACION 456', abono: 0n, cargo: 30000n },
      patrones,
    );
    expect(result.getValue().categoria).toBe(Categoria.Combustible);
    expect(result.getValue().bucket).toBe(Bucket.Necesidades);
  });

  it('SC-08: STARTS_WITH NO coincide cuando el patrón aparece en el medio → SinCategoria, categoria null', () => {
    const patrones = [
      makePatron('COPEC', 'STARTS_WITH', Categoria.Combustible, 15),
    ];
    const result = useCase.execute(
      { descripcion: 'PAGO COPEC ESTACION 456', abono: 0n, cargo: 30000n },
      patrones,
    );
    expect(result.getValue().categoria).toBeNull();
    expect(result.getValue().bucket).toBe(Bucket.SinCategoria);
  });

  it('SC-09: REGEX coincide con flag i', () => {
    const patrones = [
      makePatron('^JUMBO\\s+\\d+', 'REGEX', Categoria.Supermercado, 30),
    ];
    const result = useCase.execute(
      { descripcion: 'JUMBO 007 LAS CONDES', abono: 0n, cargo: 55000n },
      patrones,
    );
    expect(result.getValue().categoria).toBe(Categoria.Supermercado);
    expect(result.getValue().bucket).toBe(Bucket.Necesidades);
  });

  it('SC-10: menor prioridad (número más bajo) gana — primer match wins (persiste la categoría de ESE patrón)', () => {
    const patrones = [
      makePatron('JUMBO', 'CONTAINS', Categoria.Supermercado, 5, 'p1'),
      makePatron('JUMBO', 'CONTAINS', Categoria.Streaming, 20, 'p2'),
    ];
    const result = useCase.execute(
      { descripcion: 'COMPRA JUMBO', abono: 0n, cargo: 40000n },
      patrones,
    );
    expect(result.getValue().categoria).toBe(Categoria.Supermercado);
    expect(result.getValue().bucket).toBe(Bucket.Necesidades);
  });

  it('SC-10 variante: tiebreak por id cuando prioridades son iguales y el patrón es idéntico', () => {
    // Misma prioridad y mismo texto de patrón → el tiebreak final es el id:
    // id "p1" < "p2" lexicográficamente → p1 gana.
    const patrones = [
      makePatron('JUMBO', 'CONTAINS', Categoria.Streaming, 10, 'p2'),
      makePatron('JUMBO', 'CONTAINS', Categoria.Supermercado, 10, 'p1'),
    ];
    const result = useCase.execute(
      { descripcion: 'COMPRA JUMBO', abono: 0n, cargo: 40000n },
      patrones,
    );
    expect(result.getValue().categoria).toBe(Categoria.Supermercado);
    expect(result.getValue().bucket).toBe(Bucket.Necesidades);
  });

  // -------------------------------------------------------------------------
  // D-08 (US-037): bajo copias por usuario, PatronClasificacion.id pasa a ser
  // un cuid() generado — dos usuarios con el MISMO catálogo resolverían una
  // colisión de igual prioridad de forma DISTINTA si el tiebreak siguiera
  // siendo (prioridad, id). El tiebreak correcto es (prioridad, patron, id):
  // `patron` es estable, user-independiente y único dentro del template, así
  // que la resolución es la misma sin importar el userId dueño de las filas.
  // -------------------------------------------------------------------------
  it('D-08: dos patrones de igual prioridad con ids cuid() resuelven por texto de patrón, determinísticamente, en ambos órdenes de entrada', () => {
    // Ids deliberadamente en el orden CONTRARIO al orden alfabético de
    // `patron` — si el tiebreak todavía mirara `id`, este test fallaría.
    const patronAaa = makePatron(
      'aaa',
      'CONTAINS',
      Categoria.Supermercado,
      10,
      'clx0000zzzcuid', // id "mayor" lexicográficamente
    );
    const patronZzz = makePatron(
      'zzz',
      'CONTAINS',
      Categoria.Streaming,
      10,
      'clx0000aaacuid', // id "menor" lexicográficamente
    );
    const descripcion = 'COMPRA AAAZZZ TIENDA';

    const ordenAB = useCase.execute({ descripcion, abono: 0n, cargo: 1000n }, [
      patronAaa,
      patronZzz,
    ]);
    const ordenBA = useCase.execute({ descripcion, abono: 0n, cargo: 1000n }, [
      patronZzz,
      patronAaa,
    ]);

    // 'aaa' < 'zzz' por texto de patrón → Supermercado gana, sin importar el
    // orden de entrada ni el orden (contrario) de los ids.
    expect(ordenAB.getValue().categoria).toBe(Categoria.Supermercado);
    expect(ordenAB.getValue().bucket).toBe(Bucket.Necesidades);
    expect(ordenBA.getValue().categoria).toBe(Categoria.Supermercado);
    expect(ordenBA.getValue().bucket).toBe(Bucket.Necesidades);
  });

  it('SC-11: SinCategoria cuando ningún patrón coincide (categoria null)', () => {
    const patrones = [
      makePatron('JUMBO', 'CONTAINS', Categoria.Supermercado, 10),
    ];
    const result = useCase.execute(
      { descripcion: 'CASINO XYZ', abono: 0n, cargo: 5000n },
      patrones,
    );
    expect(result.getValue().categoria).toBeNull();
    expect(result.getValue().bucket).toBe(Bucket.SinCategoria);
  });

  it('SC-12: SinCategoria cuando el catálogo está vacío (categoria null)', () => {
    const result = useCase.execute(
      { descripcion: 'CUALQUIER COSA', abono: 0n, cargo: 1000n },
      [],
    );
    expect(result.getValue().categoria).toBeNull();
    expect(result.getValue().bucket).toBe(Bucket.SinCategoria);
  });

  it('matcher-never-throws: regex malformada en un patrón → use case retorna Result.ok', () => {
    const patrones = [makePatron('(', 'REGEX', Categoria.Supermercado, 1)];
    expect(() =>
      useCase.execute(
        { descripcion: 'cualquier texto', abono: 0n, cargo: 1000n },
        patrones,
      ),
    ).not.toThrow();
    const result = useCase.execute(
      { descripcion: 'cualquier texto', abono: 0n, cargo: 1000n },
      patrones,
    );
    expect(result.isOk()).toBe(true);
    expect(result.getValue().categoria).toBeNull();
    expect(result.getValue().bucket).toBe(Bucket.SinCategoria);
  });

  // SC-14: reconciliación — Ingreso sobrevive cuando el catálogo no está disponible
  it('SC-14: catálogo vacío (fallo simulado) + tx con abono>0 cargo=0 → Ingreso', () => {
    const result = useCase.execute(
      { descripcion: 'DEPOSITO SUELDO', abono: 120000n, cargo: 0n },
      [],
    );
    expect(result.getValue().categoria).toBeNull();
    expect(result.getValue().bucket).toBe(Bucket.Ingreso);
  });

  it('SC-14: catálogo vacío + tx sin abono → SinCategoria', () => {
    const result = useCase.execute(
      { descripcion: 'COMPRA ONLINE', abono: 0n, cargo: 5000n },
      [],
    );
    expect(result.getValue().categoria).toBeNull();
    expect(result.getValue().bucket).toBe(Bucket.SinCategoria);
  });
});

// ---------------------------------------------------------------------------
// Contrato: always returns Result.ok (never Result.fail)
// ---------------------------------------------------------------------------
describe('CategorizarTransaccionUseCase — contrato Result', () => {
  it('siempre retorna Result.ok, nunca Result.fail', () => {
    const cases = [
      { descripcion: 'A', abono: 100n, cargo: 0n },
      { descripcion: 'B', abono: 0n, cargo: 200n },
      { descripcion: 'C', abono: 0n, cargo: 0n },
    ];
    for (const input of cases) {
      const result = useCase.execute(input, []);
      expect(result.isOk()).toBe(true);
    }
  });
});
