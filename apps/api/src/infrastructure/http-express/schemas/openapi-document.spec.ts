import { buildOpenApiDocument } from './openapi-document';

/**
 * `buildOpenApiDocument()` must be PURE — no container, no env, no DB — so it
 * can run both at build time (`scripts/emit-openapi.ts`, no server booted)
 * and in this unit test. See openapi-contract-express design.
 */
describe('buildOpenApiDocument', () => {
  it('emits OpenAPI version 3.1.0', () => {
    const document = buildOpenApiDocument();

    expect(document.openapi).toBe('3.1.0');
  });

  it('registers GET /version with no auth requirement', () => {
    const document = buildOpenApiDocument();

    const versionPath = document.paths?.['/version'];
    expect(versionPath).toBeDefined();
    expect(versionPath?.get).toBeDefined();
    expect(versionPath?.get?.security).toBeUndefined();
  });

  it('registers GET /api/resumen with a periodo query param and a response schema', () => {
    const document = buildOpenApiDocument();

    const resumenPath = document.paths?.['/api/resumen'];
    expect(resumenPath).toBeDefined();
    expect(resumenPath?.get).toBeDefined();
    expect(resumenPath?.get?.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'periodo' })]),
    );
    expect(resumenPath?.get?.responses?.['200']).toBeDefined();
  });

  it('registers GET /api/resumen/anual with an anio query param and a response schema', () => {
    const document = buildOpenApiDocument();

    const resumenAnualPath = document.paths?.['/api/resumen/anual'];
    expect(resumenAnualPath).toBeDefined();
    expect(resumenAnualPath?.get).toBeDefined();
    expect(resumenAnualPath?.get?.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'anio' })]),
    );
    expect(resumenAnualPath?.get?.responses?.['200']).toBeDefined();
  });

  it('registers GET /api/movimientos with a periodo query param and a response schema', () => {
    const document = buildOpenApiDocument();

    const movimientosPath = document.paths?.['/api/movimientos'];
    expect(movimientosPath).toBeDefined();
    expect(movimientosPath?.get).toBeDefined();
    expect(movimientosPath?.get?.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'periodo' })]),
    );
    expect(movimientosPath?.get?.responses?.['200']).toBeDefined();
  });

  it('registers GET /api/buckets/{bucket} with a bucket path param, a periodo query param, and a response schema', () => {
    const document = buildOpenApiDocument();

    const bucketsPath = document.paths?.['/api/buckets/{bucket}'];
    expect(bucketsPath).toBeDefined();
    expect(bucketsPath?.get).toBeDefined();
    expect(bucketsPath?.get?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'bucket', in: 'path' }),
        expect.objectContaining({ name: 'periodo', in: 'query' }),
      ]),
    );
    expect(bucketsPath?.get?.responses?.['200']).toBeDefined();
  });

  it('registers GET /api/ingestas with a response schema (no query/path params)', () => {
    const document = buildOpenApiDocument();

    const ingestasPath = document.paths?.['/api/ingestas'];
    expect(ingestasPath).toBeDefined();
    expect(ingestasPath?.get).toBeDefined();
    expect(ingestasPath?.get?.responses?.['200']).toBeDefined();
  });

  it('registers POST /api/ingestas with a multipart/form-data requestBody and a response schema', () => {
    const document = buildOpenApiDocument();

    const ingestasPath = document.paths?.['/api/ingestas'];
    expect(ingestasPath).toBeDefined();
    expect(ingestasPath?.post).toBeDefined();
    const requestBody = ingestasPath?.post?.requestBody as
      | { content?: Record<string, unknown> }
      | undefined;
    expect(requestBody?.content?.['multipart/form-data']).toBeDefined();
    expect(ingestasPath?.post?.responses?.['200']).toBeDefined();
  });

  it('registers GET /api/auth/me with a response schema (no query/path params)', () => {
    const document = buildOpenApiDocument();

    const authMePath = document.paths?.['/api/auth/me'];
    expect(authMePath).toBeDefined();
    expect(authMePath?.get).toBeDefined();
    expect(authMePath?.get?.responses?.['200']).toBeDefined();
    expect(authMePath?.get?.responses?.['401']).toBeDefined();
  });

  it('registers GET /api/auth/demo with a redirect response and no JSON response body', () => {
    const document = buildOpenApiDocument();

    const authDemoPath = document.paths?.['/api/auth/demo'];
    expect(authDemoPath).toBeDefined();
    expect(authDemoPath?.get).toBeDefined();
    expect(authDemoPath?.get?.responses?.['302']).toBeDefined();
    expect(authDemoPath?.get?.responses?.['302']?.content).toBeUndefined();
    expect(authDemoPath?.get?.responses?.['403']).toBeDefined();
    expect(authDemoPath?.get?.responses?.['429']).toBeDefined();
  });

  it('is pure: calling it twice yields deep-equal documents', () => {
    const first = buildOpenApiDocument();
    const second = buildOpenApiDocument();

    expect(first).toEqual(second);
  });
});
