import { PrismaUltimoPeriodoConDatosReader } from './prisma-ultimo-periodo-con-datos.repository';
import { PrismaClient } from '@prisma/client';
import { DiaCorte } from '../../domain/value-objects/mes-financiero';

/**
 * Unit tests for PrismaUltimoPeriodoConDatosReader — mocked PrismaClient
 * (issue #747). The reader labels rows in SQL (`etiquetaPeriodoSql`, #111),
 * so the date arithmetic and the real user isolation are proven against a
 * database by ultimo-periodo-con-datos.int-spec.ts and
 * mes-financiero.int-spec.ts; here only the mapping of the row is covered.
 */
function readerCon(rows: Array<{ periodo: string }>) {
  const $queryRaw = vi.fn().mockResolvedValue(rows);
  const prisma = { $queryRaw } as unknown as PrismaClient;
  return { $queryRaw, repo: new PrismaUltimoPeriodoConDatosReader(prisma) };
}

describe('PrismaUltimoPeriodoConDatosReader', () => {
  it('usuario sin ninguna transacción → null', async () => {
    const { repo } = readerCon([]);

    const result = await repo.ultimoPeriodoConDatos(
      'user-1',
      DiaCorte.CALENDARIO,
    );

    expect(result).toBeNull();
  });

  it('corte 1: la fila `periodo` es el mes calendario', async () => {
    const { repo } = readerCon([{ periodo: '2026-03' }]);

    const result = await repo.ultimoPeriodoConDatos(
      'user-1',
      DiaCorte.CALENDARIO,
    );

    expect(result?.valor).toBe('2026-03');
    expect(result?.fechaInicio).toBe('2026-03-01');
    expect(result?.fechaFin).toBe('2026-03-31');
  });

  it('corte 25: el PeriodoMes lleva el día de corte recibido', async () => {
    const corte25 = DiaCorte.crear(25).getValue();
    const { repo } = readerCon([{ periodo: '2026-10' }]);

    const result = await repo.ultimoPeriodoConDatos('user-1', corte25);

    expect(result?.valor).toBe('2026-10');
    expect(result?.diaCorte.valor).toBe(25);
    expect(result?.fechaInicio).toBe('2026-10-25');
    expect(result?.fechaFin).toBe('2026-11-24');
  });

  it('user isolation: el userId viaja como parámetro de la query (RNF-SEC-006)', async () => {
    const { $queryRaw, repo } = readerCon([]);

    await repo.ultimoPeriodoConDatos('user-abc', DiaCorte.CALENDARIO);

    expect($queryRaw).toHaveBeenCalledTimes(1);
    const [, ...valores] = $queryRaw.mock.calls[0] as unknown[];
    expect(valores).toContain('user-abc');
  });
});
