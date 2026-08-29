import type { Request, Response } from 'express';
import { appLogger } from '../../logging/app-logger';
import { responderErrorTraducido } from './responder-error-traducido';

function mockRes(): Response {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;
  (res.status as unknown as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

function mockReq(path: string): Request {
  return { path } as unknown as Request;
}

describe('responderErrorTraducido — chokepoint único para responder + loguear el gate demo (issue #507)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('code === DEMO_SOLO_LECTURA: loguea el gate trip con { path } y responde { message, code }', () => {
    const warnSpy = vi.spyOn(appLogger, 'warn').mockImplementation(() => {});
    const res = mockRes();
    const req = mockReq('/categorias/cat-1');

    responderErrorTraducido(res, req, {
      status: 403,
      code: 'DEMO_SOLO_LECTURA',
      message: 'Las categorías de la cuenta demo son de solo lectura.',
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DEMO'), {
      path: '/categorias/cat-1',
    });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Las categorías de la cuenta demo son de solo lectura.',
      code: 'DEMO_SOLO_LECTURA',
    });
  });

  it('cualquier otro code: responde { message, code } SIN loguear', () => {
    const warnSpy = vi.spyOn(appLogger, 'warn').mockImplementation(() => {});
    const res = mockRes();
    const req = mockReq('/categorias');

    responderErrorTraducido(res, req, {
      status: 409,
      code: 'NOMBRE_DUPLICADO',
      message: 'Ya existe una categoría con ese nombre.',
    });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Ya existe una categoría con ese nombre.',
      code: 'NOMBRE_DUPLICADO',
    });
  });

  it('sin code (ingesta: aHttpError puede no traer code): responde solo { message }, sin loguear', () => {
    const warnSpy = vi.spyOn(appLogger, 'warn').mockImplementation(() => {});
    const res = mockRes();
    const req = mockReq('/ingestas');

    responderErrorTraducido(res, req, {
      status: 400,
      message: 'Extensión no permitida.',
    });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Extensión no permitida.',
    });
  });
});
