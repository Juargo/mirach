import { CategorizarTransaccionUseCase } from './categorizar-transaccion.use-case';
import { PatronClasificacion } from '../../domain/value-objects/patron-clasificacion';
import { Bucket } from '../../domain/value-objects/bucket';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makePatron(
  patron: string,
  matchType: PatronClasificacion['matchType'],
  bucket: Bucket,
  prioridad: number,
  id = `p-${patron}-${prioridad}`,
): PatronClasificacion {
  return new PatronClasificacion({ id, patron, matchType, bucket, prioridad });
}

const useCase = new CategorizarTransaccionUseCase();

// ---------------------------------------------------------------------------
// T05 — Regla Ingreso: boundaries (SC-01..SC-04)
// ---------------------------------------------------------------------------
describe('CategorizarTransaccionUseCase — regla Ingreso', () => {
  it('SC-01: abono > 0 y cargo = 0 → Ingreso (con catálogo vacío)', () => {
    const result = useCase.execute({ descripcion: 'ABONO SUELDO', abono: 15000n, cargo: 0n }, []);
    expect(result.isOk()).toBe(true);
    expect(result.getValue().bucket).toBe(Bucket.Ingreso);
  });

  it('SC-01 variante: abono > 0 y cargo = 0 → Ingreso (con patrones no vacíos)', () => {
    const patrones = [makePatron('sueldo', 'CONTAINS', Bucket.Deseos, 1)];
    const result = useCase.execute({ descripcion: 'ABONO SUELDO', abono: 15000n, cargo: 0n }, patrones);
    expect(result.isOk()).toBe(true);
    expect(result.getValue().bucket).toBe(Bucket.Ingreso);
  });

  it('SC-02: abono > 0 pero cargo > 0 → NO Ingreso, cae a SinCategoria (catálogo vacío)', () => {
    const result = useCase.execute(
      { descripcion: 'TRANSFERENCIA MIXTA', abono: 15000n, cargo: 500n },
      [],
    );
    expect(result.isOk()).toBe(true);
    expect(result.getValue().bucket).toBe(Bucket.SinCategoria);
  });

  it('SC-03: abono = 0 y cargo = 0 → NO Ingreso, cae a SinCategoria (catálogo vacío)', () => {
    const result = useCase.execute({ descripcion: 'SIN MOVIMIENTO', abono: 0n, cargo: 0n }, []);
    expect(result.isOk()).toBe(true);
    expect(result.getValue().bucket).toBe(Bucket.SinCategoria);
  });

  it('SC-04: abono = 0 y cargo > 0 → NO Ingreso, cae a SinCategoria (catálogo vacío)', () => {
    const result = useCase.execute({ descripcion: 'COMPRA LIDER', abono: 0n, cargo: 8000n }, []);
    expect(result.isOk()).toBe(true);
    expect(result.getValue().bucket).toBe(Bucket.SinCategoria);
  });

  it('regla Ingreso gana sin importar los patrones: incluso si un patrón coincide, es Ingreso', () => {
    const patrones = [makePatron('sueldo', 'CONTAINS', Bucket.Ahorro, 1)];
    const result = useCase.execute({ descripcion: 'DEPOSITO SUELDO', abono: 500000n, cargo: 0n }, patrones);
    expect(result.getValue().bucket).toBe(Bucket.Ingreso);
  });
});

// ---------------------------------------------------------------------------
// T06 — Tipos de coincidencia, prioridad, SinCategoria, matcher-never-throws (SC-05..SC-14)
// ---------------------------------------------------------------------------
describe('CategorizarTransaccionUseCase — coincidencia y prioridad', () => {
  it('SC-05: CONTAINS coincide cuando el patrón aparece como substring', () => {
    const patrones = [makePatron('LIDER', 'CONTAINS', Bucket.Necesidades, 10)];
    const result = useCase.execute(
      { descripcion: 'COMPRA LIDER SAN PABLO 123', abono: 0n, cargo: 9500n },
      patrones,
    );
    expect(result.getValue().bucket).toBe(Bucket.Necesidades);
  });

  it('SC-06: CONTAINS es insensible a mayúsculas (descripción UPPERCASE, patrón lowercase)', () => {
    const patrones = [makePatron('netflix', 'CONTAINS', Bucket.Deseos, 20)];
    const result = useCase.execute(
      { descripcion: 'SUSCRIPCION NETFLIX', abono: 0n, cargo: 5000n },
      patrones,
    );
    expect(result.getValue().bucket).toBe(Bucket.Deseos);
  });

  it('SC-07: STARTS_WITH coincide cuando la descripción empieza con el patrón', () => {
    const patrones = [makePatron('COPEC', 'STARTS_WITH', Bucket.Necesidades, 15)];
    const result = useCase.execute(
      { descripcion: 'COPEC ESTACION 456', abono: 0n, cargo: 30000n },
      patrones,
    );
    expect(result.getValue().bucket).toBe(Bucket.Necesidades);
  });

  it('SC-08: STARTS_WITH NO coincide cuando el patrón aparece en el medio → SinCategoria', () => {
    const patrones = [makePatron('COPEC', 'STARTS_WITH', Bucket.Necesidades, 15)];
    const result = useCase.execute(
      { descripcion: 'PAGO COPEC ESTACION 456', abono: 0n, cargo: 30000n },
      patrones,
    );
    expect(result.getValue().bucket).toBe(Bucket.SinCategoria);
  });

  it('SC-09: REGEX coincide con flag i', () => {
    const patrones = [makePatron('^JUMBO\\s+\\d+', 'REGEX', Bucket.Necesidades, 30)];
    const result = useCase.execute(
      { descripcion: 'JUMBO 007 LAS CONDES', abono: 0n, cargo: 55000n },
      patrones,
    );
    expect(result.getValue().bucket).toBe(Bucket.Necesidades);
  });

  it('SC-10: menor prioridad (número más bajo) gana — primer match wins', () => {
    const patrones = [
      makePatron('JUMBO', 'CONTAINS', Bucket.Necesidades, 5, 'p1'),
      makePatron('JUMBO', 'CONTAINS', Bucket.Deseos, 20, 'p2'),
    ];
    const result = useCase.execute({ descripcion: 'COMPRA JUMBO', abono: 0n, cargo: 40000n }, patrones);
    expect(result.getValue().bucket).toBe(Bucket.Necesidades);
  });

  it('SC-10 variante: tiebreak por id cuando prioridades son iguales', () => {
    // id "p1" < "p2" lexicográficamente → p1 gana
    const patrones = [
      makePatron('JUMBO', 'CONTAINS', Bucket.Deseos, 10, 'p2'),
      makePatron('JUMBO', 'CONTAINS', Bucket.Necesidades, 10, 'p1'),
    ];
    const result = useCase.execute({ descripcion: 'COMPRA JUMBO', abono: 0n, cargo: 40000n }, patrones);
    expect(result.getValue().bucket).toBe(Bucket.Necesidades);
  });

  it('SC-11: SinCategoria cuando ningún patrón coincide', () => {
    const patrones = [makePatron('JUMBO', 'CONTAINS', Bucket.Necesidades, 10)];
    const result = useCase.execute({ descripcion: 'CASINO XYZ', abono: 0n, cargo: 5000n }, patrones);
    expect(result.getValue().bucket).toBe(Bucket.SinCategoria);
  });

  it('SC-12: SinCategoria cuando el catálogo está vacío', () => {
    const result = useCase.execute({ descripcion: 'CUALQUIER COSA', abono: 0n, cargo: 1000n }, []);
    expect(result.getValue().bucket).toBe(Bucket.SinCategoria);
  });

  it('matcher-never-throws: regex malformada en un patrón → use case retorna Result.ok', () => {
    const patrones = [makePatron('(', 'REGEX', Bucket.Necesidades, 1)];
    expect(() =>
      useCase.execute({ descripcion: 'cualquier texto', abono: 0n, cargo: 1000n }, patrones),
    ).not.toThrow();
    const result = useCase.execute({ descripcion: 'cualquier texto', abono: 0n, cargo: 1000n }, patrones);
    expect(result.isOk()).toBe(true);
    expect(result.getValue().bucket).toBe(Bucket.SinCategoria);
  });

  // SC-14: reconciliación — Ingreso sobrevive cuando el catálogo no está disponible
  it('SC-14: catálogo vacío (fallo simulado) + tx con abono>0 cargo=0 → Ingreso', () => {
    const result = useCase.execute({ descripcion: 'DEPOSITO SUELDO', abono: 120000n, cargo: 0n }, []);
    expect(result.getValue().bucket).toBe(Bucket.Ingreso);
  });

  it('SC-14: catálogo vacío + tx sin abono → SinCategoria', () => {
    const result = useCase.execute({ descripcion: 'COMPRA ONLINE', abono: 0n, cargo: 5000n }, []);
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
