import { AppleAuthHttpClient } from './apple-auth-http.client';
import type { IProveedorClientSecretApple } from './apple-client-secret.signer';

// Unit — fetch inyectado; jamás red real.

const SECRET = 'client-secret-jwt';
const secretProvider: IProveedorClientSecretApple = {
  obtener: async () => SECRET,
};

function respuesta(status: number, body: unknown, textual = false) {
  return new Response(textual ? (body as string) : JSON.stringify(body), {
    status,
  });
}

/** fetch que nunca responde y rechaza cuando la señal aborta (como el real). */
function fetchColgado() {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(
            init.signal?.reason instanceof Error
              ? init.signal.reason
              : new Error('aborted'),
          );
        });
      }),
  );
}

function makeClient(fetchFn: typeof fetch, timeoutMs = 5000) {
  return new AppleAuthHttpClient(
    'app.mirachbudget.ios',
    secretProvider,
    fetchFn,
    timeoutMs,
  );
}

function formDe(llamada: unknown[]): URLSearchParams {
  return new URLSearchParams((llamada[1] as RequestInit).body as string);
}

describe('AppleAuthHttpClient.intercambiarCodigo', () => {
  it('POST /auth/token con el form exacto y retorna el refresh token', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        respuesta(200, { refresh_token: 'rt-1', access_token: 'at-1' }),
      );

    const result = await makeClient(fetchFn).intercambiarCodigo('code-abc');

    expect(result.getValue()).toBe('rt-1');
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://appleid.apple.com/auth/token');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect([...formDe(fetchFn.mock.calls[0]).entries()]).toEqual([
      ['grant_type', 'authorization_code'],
      ['code', 'code-abc'],
      ['client_id', 'app.mirachbudget.ios'],
      ['client_secret', SECRET],
    ]);
  });

  it('Apple 400 invalid_grant → fail invalid_grant', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(respuesta(400, { error: 'invalid_grant' }));

    const result = await makeClient(fetchFn).intercambiarCodigo('c');

    expect(result.isFail()).toBe(true);
    expect(result.getError().motivo).toBe('invalid_grant');
  });

  it('otro error de Apple → rechazado con el código de error saneado', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(respuesta(400, { error: 'invalid_client' }));

    const error = (
      await makeClient(fetchFn).intercambiarCodigo('c')
    ).getError();

    expect(error.motivo).toBe('rechazado');
    expect(error.detalle).toBe('invalid_client');
  });

  it('error no JSON o con código raro → rechazado con el status, sin eco del cuerpo', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(respuesta(503, '<html>RT-SECRETO</html>', true));

    const error = (
      await makeClient(fetchFn).intercambiarCodigo('c')
    ).getError();

    expect(error.motivo).toBe('rechazado');
    expect(error.detalle).toBe('503');
    expect(JSON.stringify(error)).not.toContain('SECRETO');
  });

  it('200 sin refresh_token → respuesta-invalida', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(respuesta(200, { access_token: 'x' }));

    expect(
      (await makeClient(fetchFn).intercambiarCodigo('c')).getError().motivo,
    ).toBe('respuesta-invalida');
  });

  it('200 con cuerpo no JSON → respuesta-invalida', async () => {
    const fetchFn = vi.fn().mockResolvedValue(respuesta(200, 'nope', true));

    expect(
      (await makeClient(fetchFn).intercambiarCodigo('c')).getError().motivo,
    ).toBe('respuesta-invalida');
  });

  it('fetch que no responde a tiempo → timeout (la señal aborta de verdad)', async () => {
    const fetchFn = fetchColgado();

    const result = await makeClient(
      fetchFn as unknown as typeof fetch,
      20,
    ).intercambiarCodigo('c');

    expect(result.getError().motivo).toBe('timeout');
  });

  it('error de red → red', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    expect(
      (await makeClient(fetchFn).intercambiarCodigo('c')).getError().motivo,
    ).toBe('red');
  });

  it('si no se puede firmar el secret → secret-no-disponible, sin llamar a Apple', async () => {
    const fetchFn = vi.fn();
    const client = new AppleAuthHttpClient(
      'app.mirachbudget.ios',
      {
        obtener: async () => {
          throw new Error('boom');
        },
      },
      fetchFn,
    );

    const result = await client.intercambiarCodigo('c');

    expect(result.getError().motivo).toBe('secret-no-disponible');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('AppleAuthHttpClient.revocarRefreshToken', () => {
  it('POST /auth/revoke con el form exacto; 200 → ok', async () => {
    const fetchFn = vi.fn().mockResolvedValue(respuesta(200, '', true));

    const result = await makeClient(fetchFn).revocarRefreshToken('rt-9');

    expect(result.isOk()).toBe(true);
    expect((fetchFn.mock.calls[0] as unknown[])[0]).toBe(
      'https://appleid.apple.com/auth/revoke',
    );
    expect([...formDe(fetchFn.mock.calls[0]).entries()]).toEqual([
      ['client_id', 'app.mirachbudget.ios'],
      ['client_secret', SECRET],
      ['token', 'rt-9'],
      ['token_type_hint', 'refresh_token'],
    ]);
  });

  it('Apple 400 invalid_client → rechazado', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(respuesta(400, { error: 'invalid_client' }));

    const error = (
      await makeClient(fetchFn).revocarRefreshToken('t')
    ).getError();

    expect(error.motivo).toBe('rechazado');
    expect(error.detalle).toBe('invalid_client');
  });

  it('timeout → timeout; red → red', async () => {
    const lento = fetchColgado();
    expect(
      (
        await makeClient(
          lento as unknown as typeof fetch,
          20,
        ).revocarRefreshToken('t')
      ).getError().motivo,
    ).toBe('timeout');

    const caido = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    expect(
      (await makeClient(caido).revocarRefreshToken('t')).getError().motivo,
    ).toBe('red');
  });
});
