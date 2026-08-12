import { aCatalogoHttpError } from './catalogo-http-error';
import { CatalogoDemoSoloLecturaError } from '../../../domain/errors/catalogo-demo-solo-lectura.error';
import { NombreCategoriaInvalidoError } from '../../../domain/errors/nombre-categoria-invalido.error';
import { BucketNoAsignableError } from '../../../domain/errors/bucket-no-asignable.error';
import { NombreCategoriaDuplicadoError } from '../../../domain/errors/nombre-categoria-duplicado.error';
import { CategoriaNoEncontradaError } from '../../../domain/errors/categoria-no-encontrada.error';
import { PatronInvalidoError } from '../../../domain/errors/patron-invalido.error';
import { MatchTypeInvalidoError } from '../../../domain/errors/match-type-invalido.error';
import { RegexInvalidaError } from '../../../domain/errors/regex-invalida.error';
import { PrioridadInvalidaError } from '../../../domain/errors/prioridad-invalida.error';
import { PatronDuplicadoError } from '../../../domain/errors/patron-duplicado.error';
import { PatronNoEncontradoError } from '../../../domain/errors/patron-no-encontrado.error';

describe('aCatalogoHttpError — one class, exactly one status + code', () => {
  it.each([
    [new NombreCategoriaInvalidoError('x'), 400, 'NOMBRE_INVALIDO'],
    [new BucketNoAsignableError('x'), 400, 'BUCKET_NO_ASIGNABLE'],
    [new PatronInvalidoError('x'), 400, 'PATRON_INVALIDO'],
    [new MatchTypeInvalidoError('x'), 400, 'MATCH_TYPE_INVALIDO'],
    [new RegexInvalidaError('x'), 400, 'REGEX_INVALIDA'],
    [new PrioridadInvalidaError(1000), 400, 'PRIORIDAD_INVALIDA'],
    [new CatalogoDemoSoloLecturaError(), 403, 'DEMO_SOLO_LECTURA'],
    [new CategoriaNoEncontradaError('id'), 404, 'CATEGORIA_NO_ENCONTRADA'],
    [new PatronNoEncontradoError('id'), 404, 'PATRON_NO_ENCONTRADO'],
    [new NombreCategoriaDuplicadoError('x'), 409, 'NOMBRE_DUPLICADO'],
    [new PatronDuplicadoError('x'), 409, 'PATRON_DUPLICADO'],
  ] as const)('%p -> status %i, code %s', (error, status, code) => {
    const result = aCatalogoHttpError(error);
    expect(result.status).toBe(status);
    expect(result.code).toBe(code);
    expect(result.message).toBe(error.message);
  });

  it("CatalogoDemoSoloLecturaError's message matches the DemoUploadNudge.tsx UX family", () => {
    const result = aCatalogoHttpError(new CatalogoDemoSoloLecturaError());
    expect(result.message).toContain('solo lectura');
  });
});
