import { Bucket } from '../../domain/value-objects/bucket';
import { PerfilPresupuesto } from '../../domain/value-objects/perfil-presupuesto';
import { PerfilNoSuma100Error } from '../../domain/errors/perfil-no-suma-100.error';
import { MetaPresupuestoInvalidaError } from '../../domain/errors/meta-presupuesto-invalida.error';
import { MesFinanciero } from '../../domain/value-objects/mes-financiero';
import { DiaCorteInvalidoError } from '../../domain/errors/dia-corte-invalido.error';
import { IngresoDeclaradoInvalidoError } from '../../domain/errors/ingreso-declarado-invalido.error';
import { PlanPlusRequeridoError } from '../../domain/errors/plan-plus-requerido.error';
import { IPerfilPresupuestoRepository } from '../ports/perfil-presupuesto.port';
import { NoOpLogger } from '../../../test/support/logger.double';
import {
  ActualizarPerfilPresupuestoUseCase,
  ObtenerPerfilPresupuestoUseCase,
} from './perfil-presupuesto.use-case';

const CON_PLUS = { tienePlus: () => Promise.resolve(true) };
const SIN_PLUS = { tienePlus: () => Promise.resolve(false) };

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
    const repo = makeRepo(PerfilPresupuesto.predefinido('65_20_15'));
    const r = await new ObtenerPerfilPresupuestoUseCase(repo).execute({
      userId: 'user-a',
    });
    expect(repo.obtener).toHaveBeenCalledWith('user-a');
    expect(r.getValue().perfil).toBe('65_20_15');
  });
});

describe('ActualizarPerfilPresupuestoUseCase (#110)', () => {
  it('saves a predefined profile for the requesting user and returns it', async () => {
    const repo = makeRepo();
    const uc = new ActualizarPerfilPresupuestoUseCase(
      repo,
      new NoOpLogger(),
      CON_PLUS,
    );

    const r = await uc.execute({ userId: 'user-a', perfil: '80_10_10' });

    expect(r.getValue().perfil).toBe('80_10_10');
    expect(repo.guardar).toHaveBeenCalledWith(
      'user-a',
      PerfilPresupuesto.predefinido('80_10_10'),
    );
  });

  it('saves a custom profile that sums 10000 (S6: allowed for now)', async () => {
    const repo = makeRepo();
    const uc = new ActualizarPerfilPresupuestoUseCase(
      repo,
      new NoOpLogger(),
      CON_PLUS,
    );
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
    const uc = new ActualizarPerfilPresupuestoUseCase(
      repo,
      new NoOpLogger(),
      CON_PLUS,
    );

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
    const uc = new ActualizarPerfilPresupuestoUseCase(
      repo,
      new NoOpLogger(),
      CON_PLUS,
    );

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

describe('ActualizarPerfilPresupuestoUseCase — financial month (#111)', () => {
  const conMes = (dia: number, ingreso: bigint | null) =>
    PerfilPresupuesto.porDefecto().conMesFinanciero(
      MesFinanciero.crear(dia, ingreso).getValue(),
    );

  it('saves the cut-off day and declared income with the profile', async () => {
    const repo = makeRepo();
    const uc = new ActualizarPerfilPresupuestoUseCase(
      repo,
      new NoOpLogger(),
      CON_PLUS,
    );

    const r = await uc.execute({
      userId: 'user-a',
      perfil: '65_20_15',
      diaCorte: 25,
      ingresoDeclarado: 1_500_000n,
    });

    expect(r.getValue().mesFinanciero.diaCorte.valor).toBe(25);
    expect(r.getValue().mesFinanciero.ingresoDeclarado).toBe(1_500_000n);
    const guardado = repo.guardar.mock.calls[0][1] as PerfilPresupuesto;
    expect(guardado.perfil).toBe('65_20_15');
    expect(guardado.mesFinanciero.diaCorte.valor).toBe(25);
    expect(guardado.mesFinanciero.ingresoDeclarado).toBe(1_500_000n);
  });

  it('a profile change without the new fields keeps the stored cut-off day and income', async () => {
    const repo = makeRepo(conMes(25, 900_000n));
    const uc = new ActualizarPerfilPresupuestoUseCase(
      repo,
      new NoOpLogger(),
      CON_PLUS,
    );

    const r = await uc.execute({ userId: 'user-a', perfil: '80_10_10' });

    expect(r.getValue().perfil).toBe('80_10_10');
    expect(r.getValue().mesFinanciero.diaCorte.valor).toBe(25);
    expect(r.getValue().mesFinanciero.ingresoDeclarado).toBe(900_000n);
    expect(repo.obtener).toHaveBeenCalledWith('user-a');
  });

  it('ingresoDeclarado null clears the declared income and keeps the cut-off day', async () => {
    const repo = makeRepo(conMes(25, 900_000n));
    const uc = new ActualizarPerfilPresupuestoUseCase(
      repo,
      new NoOpLogger(),
      CON_PLUS,
    );

    const r = await uc.execute({
      userId: 'user-a',
      perfil: '50_30_20',
      ingresoDeclarado: null,
    });

    expect(r.getValue().mesFinanciero.ingresoDeclarado).toBeNull();
    expect(r.getValue().mesFinanciero.diaCorte.valor).toBe(25);
  });

  it('cut-off day 29 fails with DiaCorteInvalidoError and saves nothing', async () => {
    const repo = makeRepo();
    const uc = new ActualizarPerfilPresupuestoUseCase(
      repo,
      new NoOpLogger(),
      CON_PLUS,
    );

    const r = await uc.execute({
      userId: 'user-a',
      perfil: '50_30_20',
      diaCorte: 29,
    });

    expect(r.getError()).toBeInstanceOf(DiaCorteInvalidoError);
    expect(repo.guardar).not.toHaveBeenCalled();
  });

  it('a declared income of 0 fails with IngresoDeclaradoInvalidoError and saves nothing', async () => {
    const repo = makeRepo();
    const uc = new ActualizarPerfilPresupuestoUseCase(
      repo,
      new NoOpLogger(),
      CON_PLUS,
    );

    const r = await uc.execute({
      userId: 'user-a',
      perfil: '50_30_20',
      ingresoDeclarado: 0n,
    });

    expect(r.getError()).toBeInstanceOf(IngresoDeclaradoInvalidoError);
    expect(repo.guardar).not.toHaveBeenCalled();
  });
});

describe('ActualizarPerfilPresupuestoUseCase — perfil propio es Plus (PLA-01)', () => {
  const PROPIO = {
    [Bucket.Necesidades]: 6000n,
    [Bucket.Deseos]: 2500n,
    [Bucket.Ahorro]: 1500n,
  };
  const sinPlus = (repo: IPerfilPresupuestoRepository) =>
    new ActualizarPerfilPresupuestoUseCase(repo, new NoOpLogger(), SIN_PLUS);

  it('sin Plus no se puede pasar a un perfil propio, y no se guarda nada', async () => {
    const repo = makeRepo();

    const r = await sinPlus(repo).execute({
      userId: 'user-a',
      perfil: 'personalizado',
      metas: PROPIO,
    });

    expect(r.isFail()).toBe(true);
    expect(r.getError()).toBeInstanceOf(PlanPlusRequeridoError);
    expect(repo.guardar).not.toHaveBeenCalled();
  });

  it('sin Plus se puede elegir un perfil predefinido', async () => {
    const repo = makeRepo();

    const r = await sinPlus(repo).execute({
      userId: 'user-a',
      perfil: '65_20_15',
    });

    expect(r.isOk()).toBe(true);
    expect(repo.guardar).toHaveBeenCalledTimes(1);
  });

  it('sin Plus conserva el perfil propio que ya tenía al cambiar otro dato', async () => {
    const repo = makeRepo(PerfilPresupuesto.personalizado(PROPIO).getValue());

    const r = await sinPlus(repo).execute({
      userId: 'user-a',
      perfil: 'personalizado',
      metas: PROPIO,
      diaCorte: 15,
    });

    expect(r.isOk()).toBe(true);
    expect(r.getValue().mesFinanciero.diaCorte.valor).toBe(15);
  });

  it('sin Plus no puede cambiar las metas de su perfil propio', async () => {
    const repo = makeRepo(PerfilPresupuesto.personalizado(PROPIO).getValue());

    const r = await sinPlus(repo).execute({
      userId: 'user-a',
      perfil: 'personalizado',
      metas: { ...PROPIO, [Bucket.Deseos]: 2000n, [Bucket.Ahorro]: 2000n },
    });

    expect(r.getError()).toBeInstanceOf(PlanPlusRequeridoError);
    expect(repo.guardar).not.toHaveBeenCalled();
  });

  it('un perfil propio inválido se rechaza por inválido, con o sin Plus', async () => {
    const repo = makeRepo();

    const r = await sinPlus(repo).execute({
      userId: 'user-a',
      perfil: 'personalizado',
      metas: { ...PROPIO, [Bucket.Ahorro]: 1000n },
    });

    expect(r.getError()).toBeInstanceOf(PerfilNoSuma100Error);
  });
});
