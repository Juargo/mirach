import type { Mock } from 'vitest';
import { PrismaRegistrarIngestaFallidaRepository } from './prisma-registrar-ingesta-fallida.repository';
import { PrismaClient } from '@prisma/client';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';

/**
 * Unit tests for PrismaRegistrarIngestaFallidaRepository (US-004,
 * design.md §7.2). ÚNICO escritor de filas FALLIDA (single-writer-per-state,
 * D1) — sin ICryptoService (las filas de fallo no tocan columnas de dinero).
 */
describe('PrismaRegistrarIngestaFallidaRepository.registrar (US-004)', () => {
  const baseInput = {
    userId: 'user-1',
    nombreArchivo: 'cartola.docx',
    motivo: 'extensión no permitida: .docx',
  };

  it('crea la Ingesta FALLIDA con userId/nombreArchivo/motivoFallo, sin accountId/banco (→ null)', async () => {
    const create: Mock = vi.fn().mockResolvedValue({ id: 'ingesta-fallida-1' });
    const prisma = { ingesta: { create } } as unknown as PrismaClient;
    const repo = new PrismaRegistrarIngestaFallidaRepository(prisma);

    const result = await repo.registrar(baseInput);

    expect(result.isOk()).toBe(true);
    expect(create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        nombreArchivo: 'cartola.docx',
        estado: 'FALLIDA',
        motivoFallo: 'extensión no permitida: .docx',
      },
    });
  });

  it('NO incluye accountId ni banco en el data (quedan null por columna omitida)', async () => {
    const create: Mock = vi.fn().mockResolvedValue({ id: 'ingesta-fallida-1' });
    const prisma = { ingesta: { create } } as unknown as PrismaClient;
    const repo = new PrismaRegistrarIngestaFallidaRepository(prisma);

    await repo.registrar(baseInput);

    const [{ data }] = create.mock.calls[0];
    expect(data).not.toHaveProperty('accountId');
    expect(data).not.toHaveProperty('banco');
  });

  it('el create rechaza: retorna Result.fail(PersistenciaFallidaError), nunca lanza', async () => {
    const create: Mock = vi
      .fn()
      .mockRejectedValue(new Error('conexión perdida'));
    const prisma = { ingesta: { create } } as unknown as PrismaClient;
    const repo = new PrismaRegistrarIngestaFallidaRepository(prisma);

    const result = await repo.registrar(baseInput);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PersistenciaFallidaError);
  });
});
