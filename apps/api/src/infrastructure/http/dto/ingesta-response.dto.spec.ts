import { aIngestaResponseDto } from './ingesta-response.dto';
import { ProcessIngestaResult } from '../../../application/use-cases/process-ingesta.use-case';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { Transaccion } from '../../../domain/value-objects/transaccion';

const DATA: ProcessIngestaResult = {
  archivo: {
    originalName: 'movimientos.xlsx',
    sizeInBytes: 7800,
    extension: '.xlsx',
  },
  banco: {
    banco: BancoConocido.BCI,
    tipoCuenta: TipoCuentaConocido.CuentaCorriente,
    numeroCuenta: '',
  },
  estructura: { filaEncabezados: 8, totalFilasDatos: 50 },
  ingestaId: 'ingesta-1',
  total: 2,
  transacciones: [
    Transaccion.crear({ fecha: new Date('2026-05-14T00:00:00.000Z'), descripcion: 'Compra', cargo: 8103, abono: 0 }).getValue(),
    Transaccion.crear({ fecha: new Date('2026-05-15T00:00:00.000Z'), descripcion: 'Sueldo', cargo: 0, abono: 1500000 }).getValue(),
  ],
};

describe('aIngestaResponseDto', () => {
  it('mapea ProcessIngestaResult al contrato HTTP con cargo/abono como strings', () => {
    const dto = aIngestaResponseDto(DATA);

    expect(dto).toEqual({
      ingestaId: 'ingesta-1',
      banco: 'BCI',
      tipoCuenta: 'Cuenta Corriente',
      numeroCuenta: '',
      archivo: {
        nombre: 'movimientos.xlsx',
        extension: '.xlsx',
        tamanoBytes: 7800,
      },
      totalTransacciones: 2,
      transacciones: [
        { fecha: '2026-05-14T00:00:00.000Z', descripcion: 'Compra', cargo: '8103', abono: '0' },
        { fecha: '2026-05-15T00:00:00.000Z', descripcion: 'Sueldo', cargo: '0', abono: '1500000' },
      ],
    });
  });

  it('lista vacía de transacciones: mapea a array vacío sin lanzar', () => {
    const dto = aIngestaResponseDto({ ...DATA, total: 0, transacciones: [] });

    expect(dto.totalTransacciones).toBe(0);
    expect(dto.transacciones).toEqual([]);
  });
});
