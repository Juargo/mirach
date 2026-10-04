import type { Response } from 'express';
import { responderErrorTraducido } from './responder-error-traducido';

function mockRes(): Response {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;
  (res.status as unknown as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

describe('responderErrorTraducido — chokepoint único para responder un error traducido (issue #507)', () => {
  it('cualquier otro code: responde { message, code }', () => {
    const res = mockRes();

    responderErrorTraducido(res, {
      status: 409,
      code: 'NOMBRE_DUPLICADO',
      message: 'Ya existe una categoría con ese nombre.',
    });

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Ya existe una categoría con ese nombre.',
      code: 'NOMBRE_DUPLICADO',
    });
  });

  it('con indice (CAT038-11, PatronEnLoteInvalidoError): responde { message, code, indice }', () => {
    const res = mockRes();

    responderErrorTraducido(res, {
      status: 400,
      code: 'MATCH_TYPE_INVALIDO',
      message:
        'El tipo de coincidencia debe ser uno de: CONTAINS, STARTS_WITH, REGEX.',
      indice: 1,
    });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message:
        'El tipo de coincidencia debe ser uno de: CONTAINS, STARTS_WITH, REGEX.',
      code: 'MATCH_TYPE_INVALIDO',
      indice: 1,
    });
  });

  it('sin indice: la respuesta NUNCA incluye la propiedad indice', () => {
    const res = mockRes();

    responderErrorTraducido(res, {
      status: 409,
      code: 'NOMBRE_DUPLICADO',
      message: 'Ya existe una categoría con ese nombre.',
    });

    const body = (res.json as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect('indice' in body).toBe(false);
  });

  it('sin code (ingesta: aHttpError puede no traer code): responde solo { message }', () => {
    const res = mockRes();

    responderErrorTraducido(res, {
      status: 400,
      message: 'Extensión no permitida.',
    });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Extensión no permitida.',
    });
  });
});
