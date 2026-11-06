import { Bucket } from '../../domain/value-objects/bucket';
import { TransaccionNoEncontradaError } from '../../domain/errors/transaccion-no-encontrada.error';
import { CategoriaNoEncontradaError } from '../../domain/errors/categoria-no-encontrada.error';
import { ObtenerParecidosUseCase } from './obtener-parecidos.use-case';
import {
  DESTINO,
  construirDobles,
  mov,
  patronEn,
} from './parecidos.spec-helper';

function useCase(d: ReturnType<typeof construirDobles>) {
  return new ObtenerParecidosUseCase(d.reader, d.categoriaRepo, d.planificador);
}

describe('ObtenerParecidosUseCase (CLA-03, S6)', () => {
  it('suggests the text and counts the OTHER coinciding movements of the periodo', async () => {
    const propio = mov('tx-1', 'MERPAGO*CABIFY 1234');
    const d = construirDobles({
      movimiento: propio,
      delPeriodo: [
        propio,
        mov('tx-2', 'CABIFY 99'),
        mov('tx-3', 'CABIFY', { clasificacionManual: true }),
        mov('tx-4', 'JUMBO'),
      ],
    });

    const r = await useCase(d).execute({
      userId: 'user-1',
      transaccionId: 'tx-1',
      categoriaId: DESTINO.id,
      periodo: '2026-07',
    });

    expect(r.getValue()).toEqual({
      patron: 'cabify',
      total: 1,
      existente: null,
    });
    expect(d.reader.buscarPorId).toHaveBeenCalledWith('user-1', 'tx-1');
  });

  it('names the pattern that already holds the text (CLA-17)', async () => {
    const auto = { id: 'cat-auto', nombre: 'Auto', bucket: Bucket.Necesidades };
    const d = construirDobles({
      patrones: [patronEn('p-cab', 'Cabify', auto)],
    });

    const r = await useCase(d).execute({
      userId: 'user-1',
      transaccionId: 'tx-1',
      categoriaId: DESTINO.id,
    });

    expect(r.getValue().existente).toEqual({
      patronId: 'p-cab',
      categoriaId: 'cat-auto',
      categoria: 'Auto',
      bucket: Bucket.Necesidades,
    });
  });

  it('no suggestion when fewer than 3 letters remain: patron null, total 0', async () => {
    const d = construirDobles({ movimiento: mov('tx-1', 'PP*AB 1234') });

    const r = await useCase(d).execute({
      userId: 'user-1',
      transaccionId: 'tx-1',
      categoriaId: DESTINO.id,
    });

    expect(r.getValue()).toEqual({ patron: null, total: 0, existente: null });
    expect(d.reader.buscarDelPeriodo).not.toHaveBeenCalled();
  });

  it('an internal target category offers nothing (CLA-18): patron null', async () => {
    const d = construirDobles({ categoria: { ...DESTINO, esInterna: true } });

    const r = await useCase(d).execute({
      userId: 'user-1',
      transaccionId: 'tx-1',
      categoriaId: DESTINO.id,
    });

    expect(r.getValue()).toEqual({ patron: null, total: 0, existente: null });
  });

  it("404 when the movement is not the caller's", async () => {
    const d = construirDobles({ movimiento: null });
    const r = await useCase(d).execute({
      userId: 'user-1',
      transaccionId: 'ajena',
      categoriaId: DESTINO.id,
    });
    expect(r.getError()).toBeInstanceOf(TransaccionNoEncontradaError);
  });

  it("404 when the category is not the caller's", async () => {
    const d = construirDobles({ categoria: null });
    const r = await useCase(d).execute({
      userId: 'user-1',
      transaccionId: 'tx-1',
      categoriaId: 'ajena',
    });
    expect(r.getError()).toBeInstanceOf(CategoriaNoEncontradaError);
  });
});
