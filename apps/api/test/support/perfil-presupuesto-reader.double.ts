import { IPerfilPresupuestoReader } from '../../src/application/ports/perfil-presupuesto.port';
import { MesFinanciero } from '../../src/domain/value-objects/mes-financiero';
import { PerfilPresupuesto } from '../../src/domain/value-objects/perfil-presupuesto';

/**
 * perfilReaderConCorte — budget profile reader double: the 50/30/20 default
 * with the given cut-off day of the financial month (#111). Day 1 is the
 * calendar month, the default for every user.
 */
export function perfilReaderConCorte(diaCorte = 1): IPerfilPresupuestoReader {
  const mesFinanciero = MesFinanciero.crear(diaCorte, null).getValue();
  return {
    obtener: vi
      .fn()
      .mockResolvedValue(
        PerfilPresupuesto.porDefecto().conMesFinanciero(mesFinanciero),
      ),
  };
}
