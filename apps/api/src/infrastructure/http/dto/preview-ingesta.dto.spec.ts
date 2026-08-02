import { aPreviewIngestaDto } from './preview-ingesta.dto';
import { PreviewIngestaResult } from '../../../application/use-cases/preview-ingesta.use-case';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { Transaccion } from '../../../domain/value-objects/transaccion';

const DATA: PreviewIngestaResult = {
  banco: {
    banco: BancoConocido.BCI,
    tipoCuenta: TipoCuentaConocido.CuentaCorriente,
    numeroCuenta: '123456',
  },
  estructura: { totalFilasDatos: 2 },
  muestra: [
    Transaccion.crear({
      fecha: new Date('2026-05-14T00:00:00.000Z'),
      descripcion: 'Compra',
      cargo: 8103n,
      abono: 0n,
    }).getValue(),
    Transaccion.crear({
      fecha: new Date('2026-05-15T00:00:00.000Z'),
      descripcion: 'Sueldo',
      cargo: 0n,
      abono: 1500000n,
    }).getValue(),
  ],
};

describe('aPreviewIngestaDto', () => {
  it('mapea PreviewIngestaResult al contrato HTTP con cargo/abono como strings (BigInt-safe)', () => {
    const dto = aPreviewIngestaDto(DATA);

    expect(dto).toEqual({
      banco: 'BCI',
      tipoCuenta: 'Cuenta Corriente',
      numeroCuenta: '123456',
      estructura: { totalFilasDatos: 2 },
      muestra: [
        {
          fecha: '2026-05-14T00:00:00.000Z',
          descripcion: 'Compra',
          cargo: '8103',
          abono: '0',
        },
        {
          fecha: '2026-05-15T00:00:00.000Z',
          descripcion: 'Sueldo',
          cargo: '0',
          abono: '1500000',
        },
      ],
    });
  });

  it('cargo/abono nunca son number en el DTO', () => {
    const dto = aPreviewIngestaDto(DATA);

    for (const tx of dto.muestra) {
      expect(typeof tx.cargo).toBe('string');
      expect(typeof tx.abono).toBe('string');
    }
  });

  it('muestra vacía: mapea a array vacío sin lanzar', () => {
    const dto = aPreviewIngestaDto({ ...DATA, muestra: [] });

    expect(dto.muestra).toEqual([]);
  });

  it('no re-capa la muestra: mapea 1:1 lo que recibe (D8 — el cap es decisión del use case, no del DTO)', () => {
    // 51 filas simuladas — el DTO no debe truncar a 50; esa responsabilidad
    // es exclusiva de PreviewIngestaUseCase (PREVIEW_SAMPLE_MAX).
    const muchasFilas = Array.from({ length: 51 }, (_, i) =>
      Transaccion.crear({
        fecha: new Date('2026-05-14T00:00:00.000Z'),
        descripcion: `Movimiento ${i}`,
        cargo: BigInt(i + 1),
        abono: 0n,
      }).getValue(),
    );
    const dto = aPreviewIngestaDto({ ...DATA, muestra: muchasFilas });

    expect(dto.muestra.length).toBe(51);
  });
});
