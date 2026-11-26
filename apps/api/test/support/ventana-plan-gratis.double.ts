import { VentanaPlanGratis } from '../../src/application/use-cases/ventana-plan-gratis';
import { DiaCorte } from '../../src/domain/value-objects/mes-financiero';
import { PeriodoMes } from '../../src/domain/value-objects/periodo-mes';
import { perfilReaderConCorte } from './perfil-presupuesto-reader.double';

/**
 * ventanaPlanGratisDoble — the real free plan window rule (S14) over stubbed
 * readers. By default the account has Plus, so nothing is limited; pass
 * `plus: false` and the `ancla` (the latest month with movements, `YYYY-MM`)
 * to get a window of `mesesVisibles` months ending there.
 */
export function ventanaPlanGratisDoble(
  opciones: {
    plus?: boolean;
    ancla?: string;
    mesesVisibles?: number;
    diaCorte?: number;
  } = {},
): VentanaPlanGratis {
  const { plus = true, ancla, mesesVisibles = 3, diaCorte = 1 } = opciones;
  const corte = DiaCorte.crear(diaCorte).getValue();
  return new VentanaPlanGratis(
    { tienePlus: vi.fn().mockResolvedValue(plus) },
    perfilReaderConCorte(diaCorte),
    {
      ultimoPeriodoConDatos: vi
        .fn()
        .mockResolvedValue(
          ancla === undefined
            ? null
            : PeriodoMes.crear(ancla, corte).getValue(),
        ),
    },
    { ahora: () => new Date() },
    mesesVisibles,
  );
}
