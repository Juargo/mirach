import { ValidateStructureUseCase } from './validate-structure.use-case';
import { Result } from '../../shared/result';
import { BancoConocido } from '../../domain/value-objects/nombre-banco';
import { EstructuraInvalidaError } from '../../domain/errors/estructura-invalida.error';
import {
  IStructureValidator,
  ValidatedStructure,
} from '../ports/structure-validator.port';

function makeValidator(
  impl: (
    buffer: Buffer,
    banco: BancoConocido,
  ) => Promise<Result<ValidatedStructure, EstructuraInvalidaError>>,
): IStructureValidator {
  return { validate: impl };
}

describe('ValidateStructureUseCase', () => {
  it('delega en el port y retorna Ok cuando la estructura es válida', async () => {
    const expected: ValidatedStructure = {
      banco: BancoConocido.BCI,
      filaEncabezados: 8,
      primeraFilaDatos: 9,
      totalFilasDatos: 5,
    };
    const validator = makeValidator(async () => Result.ok(expected));
    const useCase = new ValidateStructureUseCase(validator);

    const result = await useCase.execute(Buffer.from(''), BancoConocido.BCI);

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(expected);
  });

  it('propaga el error del port cuando la estructura es inválida', async () => {
    const error = new EstructuraInvalidaError(BancoConocido.Santander, [
      { tipo: 'ColumnaFaltante', columna: 'C3', esperado: 'Monto cargo ($)', encontrado: 'Cargo' },
    ]);
    const validator = makeValidator(async () => Result.fail(error));
    const useCase = new ValidateStructureUseCase(validator);

    const result = await useCase.execute(Buffer.from(''), BancoConocido.Santander);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBe(error);
    expect(result.getError().message).toContain('Monto cargo');
  });

  it('pasa el banco y el buffer recibidos al validator', async () => {
    const calls: Array<{ buffer: Buffer; banco: BancoConocido }> = [];
    const validator = makeValidator(async (buffer, banco) => {
      calls.push({ buffer, banco });
      return Result.ok({
        banco,
        filaEncabezados: 14,
        primeraFilaDatos: 15,
        totalFilasDatos: 0,
      });
    });
    const useCase = new ValidateStructureUseCase(validator);
    const buf = Buffer.from('xyz');

    await useCase.execute(buf, BancoConocido.BancoEstado);

    expect(calls).toHaveLength(1);
    expect(calls[0].buffer).toBe(buf);
    expect(calls[0].banco).toBe(BancoConocido.BancoEstado);
  });
});
