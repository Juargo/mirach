import { CategorizarTransaccionUseCase } from './categorizar-transaccion.use-case';
import { PatronClasificacion } from '../../domain/value-objects/patron-clasificacion';
import { Bucket } from '../../domain/value-objects/bucket';
import { NoOpLogger, FakeLogger } from '../../../test/support/logger.double';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CAT_SUPERMERCADO = {
  id: 'cat-supermercado',
  nombre: 'Supermercado',
  bucket: Bucket.Necesidades,
};
const CAT_STREAMING = {
  id: 'cat-streaming',
  nombre: 'Streaming',
  bucket: Bucket.Deseos,
};
const CAT_COMBUSTIBLE = {
  id: 'cat-combustible',
  nombre: 'Combustible',
  bucket: Bucket.Necesidades,
};
const CAT_AHORRO = {
  id: 'cat-ahorro',
  nombre: 'Ahorro',
  bucket: Bucket.Ahorro,
};

function makePatron(
  patron: string,
  matchType: PatronClasificacion['matchType'],
  categoria: { id: string; nombre: string; bucket: Bucket },
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

const useCase = new CategorizarTransaccionUseCase(new NoOpLogger());

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
    const patrones = [makePatron('sueldo', 'CONTAINS', CAT_STREAMING, 1)];
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
    const patrones = [makePatron('sueldo', 'CONTAINS', CAT_AHORRO, 1)];
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
// CAT-03 / Q5 (us-038): un match persiste `{ id, nombre }` de la categoría del
// patrón (ya no el enum completo); el bucket es el derivado de esa categoría
// (patron.bucket, getter de PatronClasificacion).
// ---------------------------------------------------------------------------
describe('CategorizarTransaccionUseCase — coincidencia y prioridad', () => {
  it('SC-05: CONTAINS coincide cuando el patrón aparece como substring → persiste { id, nombre } de la categoría matcheada', () => {
    const patrones = [makePatron('LIDER', 'CONTAINS', CAT_SUPERMERCADO, 10)];
    const result = useCase.execute(
      { descripcion: 'COMPRA LIDER SAN PABLO 123', abono: 0n, cargo: 9500n },
      patrones,
    );
    expect(result.getValue().categoria).toEqual({
      id: CAT_SUPERMERCADO.id,
      nombre: CAT_SUPERMERCADO.nombre,
    });
    expect(result.getValue().bucket).toBe(Bucket.Necesidades);
  });

  it('SC-06: CONTAINS es insensible a mayúsculas (descripción UPPERCASE, patrón lowercase)', () => {
    const patrones = [makePatron('netflix', 'CONTAINS', CAT_STREAMING, 20)];
    const result = useCase.execute(
      { descripcion: 'SUSCRIPCION NETFLIX', abono: 0n, cargo: 5000n },
      patrones,
    );
    expect(result.getValue().categoria).toEqual({
      id: CAT_STREAMING.id,
      nombre: CAT_STREAMING.nombre,
    });
    expect(result.getValue().bucket).toBe(Bucket.Deseos);
  });

  it('SC-07: STARTS_WITH coincide cuando la descripción empieza con el patrón', () => {
    const patrones = [makePatron('COPEC', 'STARTS_WITH', CAT_COMBUSTIBLE, 15)];
    const result = useCase.execute(
      { descripcion: 'COPEC ESTACION 456', abono: 0n, cargo: 30000n },
      patrones,
    );
    expect(result.getValue().categoria).toEqual({
      id: CAT_COMBUSTIBLE.id,
      nombre: CAT_COMBUSTIBLE.nombre,
    });
    expect(result.getValue().bucket).toBe(Bucket.Necesidades);
  });

  it('SC-08: STARTS_WITH NO coincide cuando el patrón aparece en el medio → SinCategoria, categoria null', () => {
    const patrones = [makePatron('COPEC', 'STARTS_WITH', CAT_COMBUSTIBLE, 15)];
    const result = useCase.execute(
      { descripcion: 'PAGO COPEC ESTACION 456', abono: 0n, cargo: 30000n },
      patrones,
    );
    expect(result.getValue().categoria).toBeNull();
    expect(result.getValue().bucket).toBe(Bucket.SinCategoria);
  });

  it('SC-09: REGEX coincide con flag i', () => {
    const patrones = [
      makePatron('^JUMBO\\s+\\d+', 'REGEX', CAT_SUPERMERCADO, 30),
    ];
    const result = useCase.execute(
      { descripcion: 'JUMBO 007 LAS CONDES', abono: 0n, cargo: 55000n },
      patrones,
    );
    expect(result.getValue().categoria).toEqual({
      id: CAT_SUPERMERCADO.id,
      nombre: CAT_SUPERMERCADO.nombre,
    });
    expect(result.getValue().bucket).toBe(Bucket.Necesidades);
  });

  it('SC-10: menor prioridad (número más bajo) gana — primer match wins (persiste la categoría de ESE patrón)', () => {
    const patrones = [
      makePatron('JUMBO', 'CONTAINS', CAT_SUPERMERCADO, 5, 'p1'),
      makePatron('JUMBO', 'CONTAINS', CAT_STREAMING, 20, 'p2'),
    ];
    const result = useCase.execute(
      { descripcion: 'COMPRA JUMBO', abono: 0n, cargo: 40000n },
      patrones,
    );
    expect(result.getValue().categoria).toEqual({
      id: CAT_SUPERMERCADO.id,
      nombre: CAT_SUPERMERCADO.nombre,
    });
    expect(result.getValue().bucket).toBe(Bucket.Necesidades);
  });

  // GUARDRAIL (ADR-036 precondition 2 / D-08, us-038 §9 constraint 4): el
  // tiebreak (prioridad, patron, id) es total y user-independiente — NO
  // debilitar ni eliminar estas dos aserciones.
  it('SC-10 variante: tiebreak por id cuando prioridades son iguales y el patrón es idéntico', () => {
    // Misma prioridad y mismo texto de patrón → el tiebreak final es el id:
    // id "p1" < "p2" lexicográficamente → p1 gana.
    const patrones = [
      makePatron('JUMBO', 'CONTAINS', CAT_STREAMING, 10, 'p2'),
      makePatron('JUMBO', 'CONTAINS', CAT_SUPERMERCADO, 10, 'p1'),
    ];
    const result = useCase.execute(
      { descripcion: 'COMPRA JUMBO', abono: 0n, cargo: 40000n },
      patrones,
    );
    expect(result.getValue().categoria).toEqual({
      id: CAT_SUPERMERCADO.id,
      nombre: CAT_SUPERMERCADO.nombre,
    });
    expect(result.getValue().bucket).toBe(Bucket.Necesidades);
  });

  it('D-08: dos patrones de igual prioridad con ids cuid() resuelven por texto de patrón, determinísticamente, en ambos órdenes de entrada', () => {
    // Ids deliberadamente en el orden CONTRARIO al orden alfabético de
    // `patron` — si el tiebreak todavía mirara `id`, este test fallaría.
    const patronAaa = makePatron(
      'aaa',
      'CONTAINS',
      CAT_SUPERMERCADO,
      10,
      'clx0000zzzcuid', // id "mayor" lexicográficamente
    );
    const patronZzz = makePatron(
      'zzz',
      'CONTAINS',
      CAT_STREAMING,
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
    expect(ordenAB.getValue().categoria).toEqual({
      id: CAT_SUPERMERCADO.id,
      nombre: CAT_SUPERMERCADO.nombre,
    });
    expect(ordenAB.getValue().bucket).toBe(Bucket.Necesidades);
    expect(ordenBA.getValue().categoria).toEqual({
      id: CAT_SUPERMERCADO.id,
      nombre: CAT_SUPERMERCADO.nombre,
    });
    expect(ordenBA.getValue().bucket).toBe(Bucket.Necesidades);
  });

  it('SC-11: SinCategoria cuando ningún patrón coincide (categoria null)', () => {
    const patrones = [makePatron('JUMBO', 'CONTAINS', CAT_SUPERMERCADO, 10)];
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
    const patrones = [makePatron('(', 'REGEX', CAT_SUPERMERCADO, 1)];
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

describe('CategorizarTransaccionUseCase — debug logging (ADR-033 slice B, ADR-013)', () => {
  it('loguea bucket + categoria ({id, nombre}), nunca la descripción ni los montos', () => {
    const patrones = [makePatron('LIDER', 'CONTAINS', CAT_SUPERMERCADO, 10)];
    const logger = new FakeLogger();
    const ucConLogger = new CategorizarTransaccionUseCase(logger);

    ucConLogger.execute(
      { descripcion: 'COMPRA LIDER SECRETA 123', abono: 0n, cargo: 9500n },
      patrones,
    );

    const debugCalls = logger.calls.filter((c) => c.level === 'debug');
    expect(debugCalls).toEqual([
      {
        level: 'debug',
        message: 'categorizar-transaccion: classification decision',
        context: {
          bucket: Bucket.Necesidades,
          categoria: {
            id: CAT_SUPERMERCADO.id,
            nombre: CAT_SUPERMERCADO.nombre,
          },
        },
      },
    ]);
    const serializedContexts = JSON.stringify(debugCalls.map((c) => c.context));
    expect(serializedContexts).not.toContain('LIDER SECRETA');
    expect(serializedContexts).not.toContain('9500');
  });
});
