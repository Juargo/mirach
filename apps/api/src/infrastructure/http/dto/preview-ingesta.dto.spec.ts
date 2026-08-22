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
  resumen: { totalFilas: 2, duplicadosDetectados: 0, nuevas: 2 },
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
      resumen: { totalFilas: 2, duplicadosDetectados: 0, nuevas: 2 },
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
      // Legacy mirror (@deprecated compat shim, removed by US-061).
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

    for (const fila of dto.filas) {
      expect(typeof fila.cargo).toBe('string');
      expect(typeof fila.abono).toBe('string');
    }
  });

  it('filas vacías: mapea a array vacío sin lanzar', () => {
    const dto = aPreviewIngestaDto({
      ...DATA,
      resumen: { totalFilas: 0, duplicadosDetectados: 0, nuevas: 0 },
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
      resumen: { totalFilas: 51, duplicadosDetectados: 0, nuevas: 51 },
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
      resumen: { totalFilas: 1, duplicadosDetectados: 1, nuevas: 0 },
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
    expect(dto.resumen.duplicadosDetectados).toBe(1);
  });

  // --- Compat shim (product decision 2026-08-21): deprecated legacy
  //     estructura/muestra derived from the canonical result, removed by
  //     US-061. Kept so shipped clients (deployed mobile APK, pre-migration
  //     web/mobile) keep working. ---
  describe('compat shim — deprecated estructura/muestra (US-061)', () => {
    it('estructura.totalFilasDatos refleja resumen.totalFilas', () => {
      const dto = aPreviewIngestaDto(DATA);

      expect(dto.estructura.totalFilasDatos).toBe(dto.resumen.totalFilas);
      expect(dto.estructura.totalFilasDatos).toBe(2);
    });

    it('muestra contiene SOLO los cuatro campos legacy (sin rowIndex/esDuplicado/sugerido)', () => {
      const dto = aPreviewIngestaDto(DATA);

      for (const fila of dto.muestra) {
        expect(Object.keys(fila).sort()).toEqual([
          'abono',
          'cargo',
          'descripcion',
          'fecha',
        ]);
      }
    });

    it('muestra preserva el orden y los valores de las primeras filas', () => {
      const dto = aPreviewIngestaDto(DATA);

      expect(dto.muestra).toEqual([
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
      ]);
    });

    it('muestra respeta el cap legacy de 50 aunque filas devuelva el set completo', () => {
      const tx = makeTx('2026-05-14T00:00:00.000Z', 'Movimiento', 100n, 0n);
      const muchasFilas = Array.from({ length: 51 }, (_, i) => ({
        rowIndex: i,
        transaccion: tx,
        esDuplicado: false,
        sugerido: null,
      }));
      const dto = aPreviewIngestaDto({
        ...DATA,
        resumen: { totalFilas: 51, duplicadosDetectados: 0, nuevas: 51 },
        filas: muchasFilas,
      });

      // filas devuelve TODO (sin cap), muestra corta a 50 (compat legacy).
      expect(dto.filas.length).toBe(51);
      expect(dto.muestra.length).toBe(50);
      // estructura sigue reportando el total real, no el sample.
      expect(dto.estructura.totalFilasDatos).toBe(51);
    });

    it('cargo/abono de muestra nunca son number', () => {
      const dto = aPreviewIngestaDto(DATA);

      for (const fila of dto.muestra) {
        expect(typeof fila.cargo).toBe('string');
        expect(typeof fila.abono).toBe('string');
      }
    });

    it('filas vacías: muestra vacía y estructura en 0', () => {
      const dto = aPreviewIngestaDto({
        ...DATA,
        resumen: { totalFilas: 0, duplicadosDetectados: 0, nuevas: 0 },
        filas: [],
      });

      expect(dto.muestra).toEqual([]);
      expect(dto.estructura.totalFilasDatos).toBe(0);
    });
  });
});
