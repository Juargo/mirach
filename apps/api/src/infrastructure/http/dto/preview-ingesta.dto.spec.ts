import { aPreviewIngestaDto } from './preview-ingesta.dto';
import { PreviewIngestaResult } from '../../../application/use-cases/preview-ingesta.use-case';
import { BancoConocido } from '../../../domain/value-objects/nombre-banco';
import { TipoCuentaConocido } from '../../../domain/value-objects/tipo-cuenta';
import { Transaccion } from '../../../domain/value-objects/transaccion';
import { Bucket } from '../../../domain/value-objects/bucket';

function makeTx(
  fecha: string,
  descripcion: string,
  cargo: bigint,
  abono: bigint,
): Transaccion {
  return Transaccion.crear({
    fecha: new Date(fecha),
    descripcion,
    cargo,
    abono,
  }).getValue();
}

const BANCO = {
  banco: BancoConocido.BCI,
  tipoCuenta: TipoCuentaConocido.CuentaCorriente,
  numeroCuenta: '123456',
};

const DATA: PreviewIngestaResult = {
  banco: BANCO,
  resumen: { totalFilasDatos: 2, duplicados: 0, nuevas: 2 },
  filas: [
    {
      rowIndex: 0,
      transaccion: makeTx('2026-05-14T00:00:00.000Z', 'Compra', 8103n, 0n),
      esDuplicado: false,
      sugerido: { bucket: Bucket.Necesidades, categoriaId: 'cat-abc' },
    },
    {
      rowIndex: 1,
      transaccion: makeTx('2026-05-15T00:00:00.000Z', 'Sueldo', 0n, 1500000n),
      esDuplicado: false,
      sugerido: null,
    },
  ],
};

describe('aPreviewIngestaDto', () => {
  it('mapea PreviewIngestaResult al contrato HTTP con cargo/abono como strings (BigInt-safe)', () => {
    const dto = aPreviewIngestaDto(DATA);

    expect(dto).toEqual({
      banco: 'BCI',
      tipoCuenta: 'Cuenta Corriente',
      numeroCuenta: '123456',
      resumen: { totalFilasDatos: 2, duplicados: 0, nuevas: 2 },
      filas: [
        {
          rowIndex: 0,
          fecha: '2026-05-14T00:00:00.000Z',
          descripcion: 'Compra',
          cargo: '8103',
          abono: '0',
          esDuplicado: false,
          sugerido: { bucket: 'Necesidades', categoriaId: 'cat-abc' },
        },
        {
          rowIndex: 1,
          fecha: '2026-05-15T00:00:00.000Z',
          descripcion: 'Sueldo',
          cargo: '0',
          abono: '1500000',
          esDuplicado: false,
          sugerido: null,
        },
      ],
    });
  });

  it('cargo/abono nunca son number en el DTO', () => {
    const dto = aPreviewIngestaDto(DATA);

    for (const fila of dto.filas) {
      expect(typeof fila.cargo).toBe('string');
      expect(typeof fila.abono).toBe('string');
    }
  });

  it('filas vacías: mapea a array vacío sin lanzar', () => {
    const dto = aPreviewIngestaDto({
      ...DATA,
      resumen: { totalFilasDatos: 0, duplicados: 0, nuevas: 0 },
      filas: [],
    });

    expect(dto.filas).toEqual([]);
  });

  it('no re-capa filas: mapea 1:1 lo que recibe (D-08 — sin cap de 50)', () => {
    const tx = makeTx('2026-05-14T00:00:00.000Z', 'Movimiento', 100n, 0n);
    const muchasFilas = Array.from({ length: 51 }, (_, i) => ({
      rowIndex: i,
      transaccion: tx,
      esDuplicado: false,
      sugerido: null,
    }));
    const dto = aPreviewIngestaDto({
      ...DATA,
      resumen: { totalFilasDatos: 51, duplicados: 0, nuevas: 51 },
      filas: muchasFilas,
    });

    expect(dto.filas.length).toBe(51);
  });

  it('sugerido SinCategoria se serializa como null (D-09)', () => {
    const filaConSinCategoria: PreviewIngestaResult = {
      ...DATA,
      filas: [
        {
          rowIndex: 0,
          transaccion: makeTx('2026-05-14T00:00:00.000Z', 'Tx', 100n, 0n),
          esDuplicado: false,
          sugerido: null,
        },
      ],
    };

    const dto = aPreviewIngestaDto(filaConSinCategoria);

    expect(dto.filas[0]?.sugerido).toBeNull();
  });

  it('esDuplicado se serializa correctamente', () => {
    const filaConDuplicado: PreviewIngestaResult = {
      ...DATA,
      resumen: { totalFilasDatos: 1, duplicados: 1, nuevas: 0 },
      filas: [
        {
          rowIndex: 0,
          transaccion: makeTx('2026-05-14T00:00:00.000Z', 'Tx', 100n, 0n),
          esDuplicado: true,
          sugerido: null,
        },
      ],
    };

    const dto = aPreviewIngestaDto(filaConDuplicado);

    expect(dto.filas[0]?.esDuplicado).toBe(true);
    expect(dto.resumen.duplicados).toBe(1);
  });
});
