import { Bucket } from '../../domain/value-objects/bucket';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';
import { CategoriaDesconocidaError } from '../../domain/errors/categoria-desconocida.error';
import { CategoriaInternaProtegidaError } from '../../domain/errors/categoria-interna-protegida.error';
import { PatronInvalidoError } from '../../domain/errors/patron-invalido.error';
import { PeriodoInvalidoError } from '../../domain/errors/periodo-invalido.error';
import { ReclasificarConParecidosUseCase } from './reclasificar-con-parecidos.use-case';
import {
  DESTINO,
  construirDobles,
  mov,
  patronEn,
} from './parecidos.spec-helper';

function useCase(d: ReturnType<typeof construirDobles>) {
  return new ReclasificarConParecidosUseCase(
    d.reader,
    d.categoriaRepo,
    d.planificador,
    d.writer,
  );
}

const INPUT = {
  userId: 'user-1',
  transaccionId: 'tx-1',
  categoriaId: DESTINO.id,
  periodo: '2026-07',
};

describe('ReclasificarConParecidosUseCase (CLA-03, S6)', () => {
  it('one write: reclassify by hand, create the suggested pattern, move the other coinciding rows', async () => {
    const propio = mov('tx-1', 'MERPAGO*CABIFY 1234');
    const d = construirDobles({
      movimiento: propio,
      delPeriodo: [propio, mov('tx-2', 'CABIFY 99'), mov('tx-3', 'JUMBO')],
    });

    const r = await useCase(d).execute(INPUT);

    expect(r.getValue()).toEqual({
      id: 'tx-1',
      categoriaId: DESTINO.id,
      categoria: 'Transporte',
      bucket: Bucket.Deseos,
      movidos: 2,
    });
    expect(d.writer.aplicar).toHaveBeenCalledWith('user-1', {
      categoriaId: DESTINO.id,
      reclasificarTransaccionId: 'tx-1',
      patron: {
        tipo: 'crear',
        patron: 'cabify',
        matchType: 'CONTAINS',
        prioridad: 100,
      },
      moverTransaccionIds: ['tx-2'],
    });
  });

  it('moves the existing pattern when the text lives in another category (CLA-17)', async () => {
    const auto = { id: 'cat-auto', nombre: 'Auto', bucket: Bucket.Necesidades };
    const d = construirDobles({
      patrones: [patronEn('p-cab', 'cabify', auto)],
    });

    await useCase(d).execute(INPUT);

    expect(d.writer.aplicar).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ patron: { tipo: 'mover', patronId: 'p-cab' } }),
    );
  });

  it('keeps the pattern when it already lives in the chosen category', async () => {
    const d = construirDobles({
      patrones: [patronEn('p-cab', 'cabify', DESTINO)],
    });

    await useCase(d).execute(INPUT);

    expect(d.writer.aplicar).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        patron: { tipo: 'mantener', patronId: 'p-cab' },
      }),
    );
  });

  it('400 PatronInvalido when there is no suggestion: nothing is written', async () => {
    const d = construirDobles({ movimiento: mov('tx-1', '1234 **') });
    const r = await useCase(d).execute(INPUT);
    expect(r.getError()).toBeInstanceOf(PatronInvalidoError);
    expect(d.writer.aplicar).not.toHaveBeenCalled();
  });

  it('403 on an internal category (CLA-18): nothing is written', async () => {
    const d = construirDobles({ categoria: { ...DESTINO, esInterna: true } });
    const r = await useCase(d).execute(INPUT);
    expect(r.getError()).toBeInstanceOf(CategoriaInternaProtegidaError);
    expect(d.writer.aplicar).not.toHaveBeenCalled();
  });

  it("400 CategoriaDesconocida when the category is not the caller's, like the plain PATCH", async () => {
    const d = construirDobles({ categoria: null });
    const r = await useCase(d).execute(INPUT);
    expect(r.getError()).toBeInstanceOf(CategoriaDesconocidaError);
  });

  it("404 when the movement is not the caller's", async () => {
    const d = construirDobles({ movimiento: null });
    const r = await useCase(d).execute(INPUT);
    expect(r.getError()).toBeInstanceOf(TransaccionNoEncontradaError);
    expect(d.writer.aplicar).not.toHaveBeenCalled();
  });

  it('400 on an invalid periodo: nothing is written', async () => {
    const d = construirDobles({});
    const r = await useCase(d).execute({ ...INPUT, periodo: '2026-13' });
    expect(r.getError()).toBeInstanceOf(PeriodoInvalidoError);
    expect(d.writer.aplicar).not.toHaveBeenCalled();
  });
});
