import { Bucket } from '../../domain/value-objects/bucket';
import { PerfilPresupuesto } from '../../domain/value-objects/perfil-presupuesto';
import { PerfilNoSuma100Error } from '../../domain/errors/perfil-no-suma-100.error';
import { MetaPresupuestoInvalidaError } from '../../domain/errors/meta-presupuesto-invalida.error';
import { IPerfilPresupuestoRepository } from '../ports/perfil-presupuesto.port';
import { NoOpLogger } from '../../../test/support/logger.double';
import {
  ActualizarPerfilPresupuestoUseCase,
  ObtenerPerfilPresupuestoUseCase,
} from './perfil-presupuesto.use-case';

function makeRepo(
  inicial: PerfilPresupuesto = PerfilPresupuesto.porDefecto(),
): IPerfilPresupuestoRepository & { guardar: ReturnType<typeof vi.fn> } {
  return {
    obtener: vi.fn().mockResolvedValue(inicial),
    guardar: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ObtenerPerfilPresupuestoUseCase (#110)', () => {
  it("returns the requesting user's profile", async () => {
    const repo = makeRepo(PerfilPresupuesto.predefinido('60_20_20'));
    const r = await new ObtenerPerfilPresupuestoUseCase(repo).execute({
      userId: 'user-a',
    });
    expect(repo.obtener).toHaveBeenCalledWith('user-a');
    expect(r.getValue().perfil).toBe('60_20_20');
  });
});

describe('ActualizarPerfilPresupuestoUseCase (#110)', () => {
  it('saves a predefined profile for the requesting user and returns it', async () => {
    const repo = makeRepo();
    const uc = new ActualizarPerfilPresupuestoUseCase(repo, new NoOpLogger());

    const r = await uc.execute({ userId: 'user-a', perfil: '80_10_10' });

    expect(r.getValue().perfil).toBe('80_10_10');
    expect(repo.guardar).toHaveBeenCalledWith(
      'user-a',
      PerfilPresupuesto.predefinido('80_10_10'),
    );
  });

  it('saves a custom profile that sums 10000 (S6: allowed for now)', async () => {
    const repo = makeRepo();
    const uc = new ActualizarPerfilPresupuestoUseCase(repo, new NoOpLogger());
    const metas = {
      [Bucket.Necesidades]: 5500n,
      [Bucket.Deseos]: 2500n,
      [Bucket.Ahorro]: 2000n,
    };

    const r = await uc.execute({
      userId: 'user-a',
      perfil: 'personalizado',
      metas,
    });

    expect(r.getValue().perfil).toBe('personalizado');
    expect(r.getValue().metas).toEqual(metas);
    expect(repo.guardar).toHaveBeenCalledTimes(1);
  });

  it('a custom 60/30/20 fails with PerfilNoSuma100Error and saves nothing', async () => {
    const repo = makeRepo();
    const uc = new ActualizarPerfilPresupuestoUseCase(repo, new NoOpLogger());

    const r = await uc.execute({
      userId: 'user-a',
      perfil: 'personalizado',
      metas: {
        [Bucket.Necesidades]: 6000n,
        [Bucket.Deseos]: 3000n,
        [Bucket.Ahorro]: 2000n,
      },
    });

    expect(r.getError()).toBeInstanceOf(PerfilNoSuma100Error);
    expect(repo.guardar).not.toHaveBeenCalled();
  });

  it('a negative goal fails with MetaPresupuestoInvalidaError and saves nothing', async () => {
    const repo = makeRepo();
    const uc = new ActualizarPerfilPresupuestoUseCase(repo, new NoOpLogger());

    const r = await uc.execute({
      userId: 'user-a',
      perfil: 'personalizado',
      metas: {
        [Bucket.Necesidades]: 11000n,
        [Bucket.Deseos]: -1000n,
        [Bucket.Ahorro]: 0n,
      },
    });

    expect(r.getError()).toBeInstanceOf(MetaPresupuestoInvalidaError);
    expect(repo.guardar).not.toHaveBeenCalled();
  });
});
