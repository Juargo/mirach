import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PdfjsTransactionNormalizerService } from './pdfjs-transaction-normalizer.service';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { EstructuraPdfInvalidaError } from '../../domain/errors/estructura-pdf-invalida.error';

const fixturesDir = join(__dirname, '../../../test/fixtures/pdf');

describe('PdfjsTransactionNormalizerService', () => {
  const service = new PdfjsTransactionNormalizerService();

  it('Santander (fixture real): normaliza a las 7 filas de movimiento reales del período 01/03–31/03/2026 (PDF-03)', async () => {
    const buffer = await readFile(
      join(fixturesDir, 'santander-cartola-test.pdf'),
    );

    const result = await service.normalize(buffer, BancoConocido.Santander);

    expect(result.isOk()).toBe(true);
    const transacciones = result.getValue();
    expect(transacciones).toHaveLength(7);
    for (const t of transacciones) {
      expect(t.fecha.getUTCFullYear()).toBe(2026);
      expect(t.fecha.getUTCMonth()).toBe(2); // marzo, 0-indexed
      expect(Number.isInteger(t.cargo)).toBe(true);
      expect(Number.isInteger(t.abono)).toBe(true);
    }
  });

  it('Santander: descripciones se reconstruyen palabra-por-palabra (merge por rango de X)', async () => {
    const buffer = await readFile(
      join(fixturesDir, 'santander-cartola-test.pdf'),
    );

    const result = await service.normalize(buffer, BancoConocido.Santander);

    const descripciones = result.getValue().map((t) => t.descripcion);
    expect(descripciones).toContain('Transf a Tercero Maria Ejemplo');
    expect(descripciones).toContain('Abono Sueldo Empresa Generica');
  });

  it('Santander: "Resumen de Comisiones" queda excluido — no aparece una octava fila duplicada', async () => {
    const buffer = await readFile(
      join(fixturesDir, 'santander-cartola-test.pdf'),
    );

    const result = await service.normalize(buffer, BancoConocido.Santander);

    const transacciones = result.getValue();
    const suscripciones = transacciones.filter(
      (t) => t.descripcion === 'Suscripcion Servicio Streaming',
    );
    expect(suscripciones).toHaveLength(1);
  });

  it('Santander: cargo/abono se asignan a la columna correcta con monto entero exacto', async () => {
    const buffer = await readFile(
      join(fixturesDir, 'santander-cartola-test.pdf'),
    );

    const result = await service.normalize(buffer, BancoConocido.Santander);

    const transferencia = result
      .getValue()
      .find((t) => t.descripcion === 'Transf a Tercero Maria Ejemplo');
    expect(transferencia).toEqual({
      fecha: new Date(Date.UTC(2026, 2, 20)),
      descripcion: 'Transf a Tercero Maria Ejemplo',
      cargo: 120000,
      abono: 0,
    });

    const sueldo = result
      .getValue()
      .find((t) => t.descripcion === 'Abono Sueldo Empresa Generica');
    expect(sueldo).toEqual({
      fecha: new Date(Date.UTC(2026, 2, 5)),
      descripcion: 'Abono Sueldo Empresa Generica',
      cargo: 0,
      abono: 850000,
    });
  });

  it('retorna Fail(EstructuraPdfInvalidaError) para un banco sin configuración de normalización (PR4a: solo Santander)', async () => {
    const buffer = await readFile(
      join(fixturesDir, 'bancoestado-cartola-test.pdf'),
    );

    const result = await service.normalize(buffer, BancoConocido.BancoEstado);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EstructuraPdfInvalidaError);
  });

  it('retorna Fail(EstructuraPdfInvalidaError) para un buffer corrupto, sin colgar el proceso', async () => {
    const buffer = Buffer.from('esto no es un pdf');

    const result = await service.normalize(buffer, BancoConocido.Santander);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EstructuraPdfInvalidaError);
  });

  it('el mensaje de error nunca interpola texto crudo del PDF', async () => {
    const buffer = await readFile(
      join(fixturesDir, 'bancoestado-cartola-test.pdf'),
    );

    const result = await service.normalize(buffer, BancoConocido.BancoEstado);

    expect(result.isFail()).toBe(true);
    expect(result.getError().message).not.toContain('$');
  });
});
