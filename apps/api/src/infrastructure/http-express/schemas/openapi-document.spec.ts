import {
  buildOpenApiDocument,
  listNullInNullableEnums,
} from './openapi-document';
import { CODIGOS_401 } from '../auth-error-codes';

/**
 * `buildOpenApiDocument()` must be PURE — no container, no env, no DB — so it
 * can run both at build time (`scripts/emit-openapi.ts`, no server booted)
 * and in this unit test. See openapi-contract-express design.
 */
describe('buildOpenApiDocument', () => {
  it('emits OpenAPI version 3.0.3 (the Swift client generator needs `nullable: true`)', () => {
    const document = buildOpenApiDocument();

    expect(document.openapi).toBe('3.0.3');
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

  it('registers POST /api/ingestas/preview with a multipart/form-data requestBody and a response schema', () => {
    const document = buildOpenApiDocument();

    const previewPath = document.paths?.['/api/ingestas/preview'];
    expect(previewPath).toBeDefined();
    expect(previewPath?.post).toBeDefined();
    const requestBody = previewPath?.post?.requestBody as
      | { content?: Record<string, unknown> }
      | undefined;
    expect(requestBody?.content?.['multipart/form-data']).toBeDefined();
    expect(previewPath?.post?.responses?.['200']).toBeDefined();
  });

  it('registers DELETE /api/ingestas/{id} with an id path param and no response-body schema', () => {
    const document = buildOpenApiDocument();

    const deletePath = document.paths?.['/api/ingestas/{id}'];
    expect(deletePath).toBeDefined();
    expect(deletePath?.delete).toBeDefined();
    expect(deletePath?.delete?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'id', in: 'path' }),
      ]),
    );
    expect(deletePath?.delete?.responses?.['204']).toBeDefined();
    expect(deletePath?.delete?.responses?.['204']?.content).toBeUndefined();
  });

  it('registers GET /api/auth/me with a response schema (no query/path params)', () => {
    const document = buildOpenApiDocument();

    const authMePath = document.paths?.['/api/auth/me'];
    expect(authMePath).toBeDefined();
    expect(authMePath?.get).toBeDefined();
    expect(authMePath?.get?.responses?.['200']).toBeDefined();
    expect(authMePath?.get?.responses?.['401']).toBeDefined();
  });

  it('does not register GET /api/auth/demo (demo mode was removed)', () => {
    const document = buildOpenApiDocument();

    expect(document.paths?.['/api/auth/demo']).toBeUndefined();
  });

  it('registers POST /api/auth/login with a JSON requestBody and a response schema', () => {
    const document = buildOpenApiDocument();

    const loginPath = document.paths?.['/api/auth/login'];
    expect(loginPath).toBeDefined();
    expect(loginPath?.post).toBeDefined();
    const requestBody = loginPath?.post?.requestBody as
      | { content?: Record<string, unknown> }
      | undefined;
    expect(requestBody?.content?.['application/json']).toBeDefined();
    expect(loginPath?.post?.responses?.['200']).toBeDefined();
    expect(loginPath?.post?.responses?.['401']).toBeDefined();
    expect(loginPath?.post?.responses?.['429']).toBeDefined();
  });

  it('registers POST /api/auth/logout with a 204 response and no requestBody/response schema', () => {
    const document = buildOpenApiDocument();

    const logoutPath = document.paths?.['/api/auth/logout'];
    expect(logoutPath).toBeDefined();
    expect(logoutPath?.post).toBeDefined();
    expect(logoutPath?.post?.requestBody).toBeUndefined();
    expect(logoutPath?.post?.responses?.['204']).toBeDefined();
    expect(logoutPath?.post?.responses?.['204']?.content).toBeUndefined();
  });

  it('registers PATCH /api/transacciones/{id}/categoria with an id path param, a JSON requestBody, and a response schema', () => {
    const document = buildOpenApiDocument();

    const categoriaPath = document.paths?.['/api/transacciones/{id}/categoria'];
    expect(categoriaPath).toBeDefined();
    expect(categoriaPath?.patch).toBeDefined();
    expect(categoriaPath?.patch?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'id', in: 'path' }),
      ]),
    );
    const requestBody = categoriaPath?.patch?.requestBody as
      | { content?: Record<string, unknown> }
      | undefined;
    expect(requestBody?.content?.['application/json']).toBeDefined();
    expect(categoriaPath?.patch?.responses?.['200']).toBeDefined();
    expect(categoriaPath?.patch?.responses?.['400']).toBeDefined();
    expect(categoriaPath?.patch?.responses?.['404']).toBeDefined();
  });

  it('registers GET /api/auth/capabilities with a response schema (no query/path params, AC-10)', () => {
    const document = buildOpenApiDocument();

    const capabilitiesPath = document.paths?.['/api/auth/capabilities'];
    expect(capabilitiesPath).toBeDefined();
    expect(capabilitiesPath?.get).toBeDefined();
    expect(capabilitiesPath?.get?.responses?.['200']).toBeDefined();
    expect(capabilitiesPath?.get?.responses?.['401']).toBeDefined();
  });

  it('registers PATCH /api/perfil with a JSON requestBody and 200/400/403/401 responses (US-040)', () => {
    const document = buildOpenApiDocument();

    const perfilPath = document.paths?.['/api/perfil'];
    expect(perfilPath).toBeDefined();
    expect(perfilPath?.patch).toBeDefined();
    const requestBody = perfilPath?.patch?.requestBody as
      | { content?: Record<string, unknown> }
      | undefined;
    expect(requestBody?.content?.['application/json']).toBeDefined();
    expect(perfilPath?.patch?.responses?.['200']).toBeDefined();
    expect(perfilPath?.patch?.responses?.['400']).toBeDefined();
    expect(perfilPath?.patch?.responses?.['403']).toBeDefined();
    expect(perfilPath?.patch?.responses?.['401']).toBeDefined();
  });

  it('registers PATCH /api/perfil/password with a JSON requestBody and 204/400/403/401 responses (US-040)', () => {
    const document = buildOpenApiDocument();

    const passwordPath = document.paths?.['/api/perfil/password'];
    expect(passwordPath).toBeDefined();
    expect(passwordPath?.patch).toBeDefined();
    const requestBody = passwordPath?.patch?.requestBody as
      | { content?: Record<string, unknown> }
      | undefined;
    expect(requestBody?.content?.['application/json']).toBeDefined();
    expect(passwordPath?.patch?.responses?.['204']).toBeDefined();
    expect(passwordPath?.patch?.responses?.['400']).toBeDefined();
    expect(passwordPath?.patch?.responses?.['403']).toBeDefined();
    expect(passwordPath?.patch?.responses?.['401']).toBeDefined();
  });

  it('registers POST /api/perfil/google/vincular with a JSON requestBody and 200/400/403/409/503/401/404 responses (US-041, VINC041-01)', () => {
    const document = buildOpenApiDocument();

    const vincularPath = document.paths?.['/api/perfil/google/vincular'];
    expect(vincularPath).toBeDefined();
    expect(vincularPath?.post).toBeDefined();
    const requestBody = vincularPath?.post?.requestBody as
      | { content?: Record<string, unknown> }
      | undefined;
    expect(requestBody?.content?.['application/json']).toBeDefined();
    expect(vincularPath?.post?.responses?.['200']).toBeDefined();
    expect(vincularPath?.post?.responses?.['400']).toBeDefined();
    expect(vincularPath?.post?.responses?.['403']).toBeDefined();
    expect(vincularPath?.post?.responses?.['409']).toBeDefined();
    expect(vincularPath?.post?.responses?.['503']).toBeDefined();
    expect(vincularPath?.post?.responses?.['401']).toBeDefined();
    expect(vincularPath?.post?.responses?.['404']).toBeDefined();
  });

  it('registers POST /api/perfil/google/desvincular with a JSON requestBody and 204/400/403/401 responses (US-041, VINC041-05)', () => {
    const document = buildOpenApiDocument();

    const desvincularPath = document.paths?.['/api/perfil/google/desvincular'];
    expect(desvincularPath).toBeDefined();
    expect(desvincularPath?.post).toBeDefined();
    const requestBody = desvincularPath?.post?.requestBody as
      | { content?: Record<string, unknown> }
      | undefined;
    expect(requestBody?.content?.['application/json']).toBeDefined();
    expect(desvincularPath?.post?.responses?.['204']).toBeDefined();
    expect(desvincularPath?.post?.responses?.['400']).toBeDefined();
    expect(desvincularPath?.post?.responses?.['403']).toBeDefined();
    expect(desvincularPath?.post?.responses?.['401']).toBeDefined();
  });

  it('authGoogleCallbackOperation description documents the dual mode and both link redirect targets (US-041, no response-shape change)', () => {
    const document = buildOpenApiDocument();

    const callbackPath = document.paths?.['/api/auth/google/callback'];
    expect(callbackPath?.get?.description).toContain(
      'configuracion?google=vinculado',
    );
    expect(callbackPath?.get?.description).toContain(
      'configuracion?google=error',
    );
    // Additivity (design §5.5): la respuesta 302 sigue documentada, sin cambio de forma.
    expect(callbackPath?.get?.responses?.['302']).toBeDefined();
  });

  it('registers GET /api/resumen/semaforo with a periodo query param and a response schema (US-049)', () => {
    const document = buildOpenApiDocument();

    const semaforoPath = document.paths?.['/api/resumen/semaforo'];
    expect(semaforoPath).toBeDefined();
    expect(semaforoPath?.get).toBeDefined();
    expect(semaforoPath?.get?.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'periodo' })]),
    );
    expect(semaforoPath?.get?.responses?.['200']).toBeDefined();
  });

  it('registers GET /api/buckets/{bucket}/detalle with a bucket path param, a periodo query param, and 200/400 responses (US-051)', () => {
    const document = buildOpenApiDocument();

    const detallePath = document.paths?.['/api/buckets/{bucket}/detalle'];
    expect(detallePath).toBeDefined();
    expect(detallePath?.get).toBeDefined();
    expect(detallePath?.get?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'bucket', in: 'path' }),
        expect.objectContaining({ name: 'periodo', in: 'query' }),
      ]),
    );
    expect(detallePath?.get?.responses?.['200']).toBeDefined();
    expect(detallePath?.get?.responses?.['400']).toBeDefined();
  });

  it('registers GET /api/ingresos/mes with a periodo query param and 200/400 responses (US-052)', () => {
    const document = buildOpenApiDocument();

    const ingresosMesPath = document.paths?.['/api/ingresos/mes'];
    expect(ingresosMesPath).toBeDefined();
    expect(ingresosMesPath?.get).toBeDefined();
    expect(ingresosMesPath?.get?.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'periodo' })]),
    );
    expect(ingresosMesPath?.get?.responses?.['200']).toBeDefined();
    expect(ingresosMesPath?.get?.responses?.['400']).toBeDefined();
  });

  it('registers POST /api/ingestas/commit with a multipart/form-data requestBody and 201/400/500 responses (US-057 PR5)', () => {
    const document = buildOpenApiDocument();

    const commitPath = document.paths?.['/api/ingestas/commit'];
    expect(commitPath).toBeDefined();
    expect(commitPath?.post).toBeDefined();
    const requestBody = commitPath?.post?.requestBody as
      | { content?: Record<string, unknown> }
      | undefined;
    expect(requestBody?.content?.['multipart/form-data']).toBeDefined();
    expect(commitPath?.post?.responses?.['201']).toBeDefined();
    expect(commitPath?.post?.responses?.['400']).toBeDefined();
    expect(commitPath?.post?.responses?.['500']).toBeDefined();
  });

  it('marks POST /api/ingestas (one-shot upload) as deprecated (US-057 CA-05)', () => {
    const document = buildOpenApiDocument();

    const ingestasPath = document.paths?.['/api/ingestas'];
    // The one-shot POST must carry deprecated: true (D-14) — behavior unchanged.
    expect(
      (ingestasPath?.post as { deprecated?: boolean } | undefined)?.deprecated,
    ).toBe(true);
  });

  it('preview operation description mentions full rows (not a sample) after US-057 PR5 update', () => {
    const document = buildOpenApiDocument();

    const previewPath = document.paths?.['/api/ingestas/preview'];
    // Description must reflect that all rows are returned (no 50-cap) and include
    // per-row dedup status + classification suggestion. Compat shim (US-057 PR2,
    // D-08a): it must also flag the deprecated legacy fields removed by US-061.
    expect(previewPath?.post?.description).toContain('ALL rows');
    expect(previewPath?.post?.description).toContain('esDuplicado');
    expect(previewPath?.post?.description).toContain('DEPRECATED');
    expect(previewPath?.post?.description).toContain('US-061');
  });

  it('is pure: calling it twice yields deep-equal documents', () => {
    const first = buildOpenApiDocument();
    const second = buildOpenApiDocument();

    expect(first).toEqual(second);
  });

  // ── US-058 POST /api/movimientos (T-20) ────────────────────────────────────

  it('registers POST /api/movimientos with a 201 response (US-058, T-20)', () => {
    const document = buildOpenApiDocument();

    const movimientosPath = document.paths?.['/api/movimientos'];
    expect(movimientosPath).toBeDefined();
    expect(movimientosPath?.post).toBeDefined();
    expect(movimientosPath?.post?.responses?.['201']).toBeDefined();
  });

  it('POST /api/movimientos request body is application/json (US-058, T-20)', () => {
    const document = buildOpenApiDocument();

    const postOp = document.paths?.['/api/movimientos']?.post;
    const requestBody = postOp?.requestBody as
      | { content: Record<string, unknown> }
      | undefined;
    expect(requestBody).toBeDefined();
    expect(requestBody?.content?.['application/json']).toBeDefined();
  });

  it('POST /api/movimientos has a 400 error response documented (US-058, T-20)', () => {
    const document = buildOpenApiDocument();

    const postOp = document.paths?.['/api/movimientos']?.post;
    expect(postOp?.responses?.['400']).toBeDefined();
  });

  it('POST /api/movimientos has a 500 error response documented (US-058, T-20)', () => {
    const document = buildOpenApiDocument();

    const postOp = document.paths?.['/api/movimientos']?.post;
    expect(postOp?.responses?.['500']).toBeDefined();
  });

  it('POST /api/movimientos Ingreso variant emits additionalProperties:false (US-058, T-20 contract)', () => {
    const document = buildOpenApiDocument();

    const postOp = document.paths?.['/api/movimientos']?.post;
    const requestBody = postOp?.requestBody as
      | { content: { 'application/json': { schema: { anyOf: unknown[] } } } }
      | undefined;
    const schema = requestBody?.content?.['application/json']?.schema as
      | { anyOf?: Array<{ additionalProperties?: boolean }> }
      | undefined;

    expect(schema?.anyOf).toBeDefined();
    expect(schema?.anyOf?.length).toBeGreaterThanOrEqual(2);
    // Find the Ingreso variant by its discriminant rather than by position — positional
    // indexing breaks if zod-openapi reorders the variants.
    const ingresoVariant = (
      schema?.anyOf as Array<{
        additionalProperties?: boolean;
        properties?: { tipo?: { enum?: string[] } };
      }>
    )?.find((v) => v.properties?.tipo?.enum?.[0] === 'Ingreso');
    expect(ingresoVariant).toBeDefined();
    // The Ingreso variant must carry additionalProperties:false —
    // proving .strict() is in effect and the document matches the runtime rejection.
    expect(ingresoVariant?.additionalProperties).toBe(false);
  });

  it('POST /api/movimientos Gasto variant required array includes bucket and categoriaId (US-058, T-20 contract)', () => {
    const document = buildOpenApiDocument();

    const postOp = document.paths?.['/api/movimientos']?.post;
    const requestBody = postOp?.requestBody as
      | { content: { 'application/json': { schema: { anyOf: unknown[] } } } }
      | undefined;
    const schema = requestBody?.content?.['application/json']?.schema as
      | { anyOf?: Array<{ required?: string[] }> }
      | undefined;

    expect(schema?.anyOf).toBeDefined();
    // Find the Gasto variant by its discriminant rather than by position.
    const gastoVariant = (
      schema?.anyOf as Array<{
        required?: string[];
        properties?: { tipo?: { enum?: string[] } };
      }>
    )?.find((v) => v.properties?.tipo?.enum?.[0] === 'Gasto');
    expect(gastoVariant).toBeDefined();
    expect(gastoVariant?.required).toContain('bucket');
    expect(gastoVariant?.required).toContain('categoriaId');
  });

  it('POST /api/movimientos 201 response schema required array includes all 8 DTO fields (US-058, T-20 contract)', () => {
    const document = buildOpenApiDocument();

    // zod-openapi hoists named schemas to components/schemas (via .meta({ id })).
    // The 201 body schema is a $ref to RegistrarMovimientoManualResponse — navigate there.
    const components = document.components as
      | Record<string, Record<string, { required?: string[] }>>
      | undefined;
    const responseSchema =
      components?.schemas?.['RegistrarMovimientoManualResponse'];
    const required = responseSchema?.required ?? [];

    // All 8 fields from RegistrarMovimientoManualResponseDto must be in required.
    expect(required).toContain('id');
    expect(required).toContain('fecha');
    expect(required).toContain('descripcion');
    expect(required).toContain('cargo');
    expect(required).toContain('abono');
    expect(required).toContain('bucket');
    expect(required).toContain('categoriaId');
    expect(required).toContain('origen');
  });

  it('registers POST /api/transacciones/reevaluar with no request body and a counts-only response schema', () => {
    const document = buildOpenApiDocument();

    const reevaluarPath = document.paths?.['/api/transacciones/reevaluar'];
    expect(reevaluarPath).toBeDefined();
    expect(reevaluarPath?.post).toBeDefined();
    expect(reevaluarPath?.post?.requestBody).toBeUndefined();
    expect(reevaluarPath?.post?.responses?.['200']).toBeDefined();
    expect(reevaluarPath?.post?.responses?.['403']).toBeUndefined();
    expect(reevaluarPath?.post?.responses?.['500']).toBeDefined();

    const components = document.components as
      | Record<string, Record<string, { required?: string[] }>>
      | undefined;
    const responseSchema = components?.schemas?.['ReevaluarCategoriasResponse'];
    expect(responseSchema?.required).toContain('transaccionesEvaluadas');
    expect(responseSchema?.required).toContain('transaccionesActualizadas');
  });

  describe('401 responses', () => {
    const METODOS = ['get', 'post', 'patch', 'delete'] as const;
    const FAMILIA_SOLO_API_KEY = [
      'POST /api/auth/logout',
      'GET /api/auth/capabilities',
      'GET /api/auth/google',
      'GET /api/auth/google/callback',
    ];
    const FAMILIA_CREDENCIALES = [
      'POST /api/auth/login',
      'POST /api/auth/google/token',
      'POST /api/auth/apple/token',
    ];

    function refDe401(operation: unknown): string | undefined {
      const response = (
        operation as {
          responses?: Record<
            string,
            { content?: Record<string, { schema?: { $ref?: string } }> }
          >;
        }
      ).responses?.['401'];
      return response?.content?.['application/json']?.schema?.$ref;
    }

    const operaciones = () => {
      const { paths } = buildOpenApiDocument();
      return Object.entries(paths ?? {}).flatMap(([ruta, item]) =>
        METODOS.filter((m) => item?.[m] !== undefined).map((m) => ({
          clave: `${m.toUpperCase()} ${ruta}`,
          ruta,
          operation: item?.[m],
        })),
      );
    };

    it('every operation except GET /version declares a 401 with a typed body', () => {
      const sinTipo = operaciones()
        .filter(({ ruta }) => ruta !== '/version')
        .filter(({ operation }) => refDe401(operation) === undefined)
        .map(({ clave }) => clave);
      expect(sinTipo).toEqual([]);
    });

    it('GET /version stays public: no 401', () => {
      const { paths } = buildOpenApiDocument();
      expect(paths?.['/version']?.get?.responses?.['401']).toBeUndefined();
    });

    it.each([
      ['protected operations', 'UnauthorizedResponse'],
      ['api-key-only operations', 'ApiKeyUnauthorizedResponse'],
      ['sign-in operations', 'CredentialsUnauthorizedResponse'],
    ])('%s reference %s', (_nombre, schema) => {
      const esperadas = (clave: string) =>
        FAMILIA_SOLO_API_KEY.includes(clave)
          ? 'ApiKeyUnauthorizedResponse'
          : FAMILIA_CREDENCIALES.includes(clave)
            ? 'CredentialsUnauthorizedResponse'
            : 'UnauthorizedResponse';
      const refs = operaciones()
        .filter(({ ruta }) => ruta !== '/version')
        .filter(({ clave }) => esperadas(clave) === schema)
        .map(({ operation }) => refDe401(operation));
      expect(refs.length).toBeGreaterThan(0);
      expect(new Set(refs)).toEqual(
        new Set([`#/components/schemas/${schema}`]),
      );
    });

    it('the 401 code enums per family are built from CODIGOS_401 and together cover all of them (emitters are proven in their own specs)', () => {
      const schemas = buildOpenApiDocument().components?.schemas as Record<
        string,
        { properties: { code: { enum?: string[] } } }
      >;
      expect(schemas.UnauthorizedResponse.properties.code.enum).toEqual([
        'API_KEY_INVALIDA',
        'SESION_INVALIDA',
      ]);
      expect(schemas.ApiKeyUnauthorizedResponse.properties.code.enum).toEqual([
        'API_KEY_INVALIDA',
      ]);
      expect(
        schemas.CredentialsUnauthorizedResponse.properties.code.enum,
      ).toEqual(['API_KEY_INVALIDA', 'CREDENCIALES_INVALIDAS']);
      const union = new Set([
        ...(schemas.UnauthorizedResponse.properties.code.enum ?? []),
        ...(schemas.ApiKeyUnauthorizedResponse.properties.code.enum ?? []),
        ...(schemas.CredentialsUnauthorizedResponse.properties.code.enum ?? []),
      ]);
      expect(union).toEqual(new Set(CODIGOS_401));
    });
  });

  describe('error codes', () => {
    type Json = Record<string, unknown>;
    const document = () => buildOpenApiDocument();

    function schemaRef(operation: unknown, status: string): string | undefined {
      const responses = (operation as { responses?: Record<string, Json> })
        .responses;
      const content = responses?.[status]?.content as
        | Record<string, { schema?: { $ref?: string } }>
        | undefined;
      return content?.['application/json']?.schema?.$ref;
    }

    function componente(ref: string | undefined) {
      const nombre = ref?.split('/').pop() ?? '';
      return (
        document().components?.schemas as Record<
          string,
          {
            properties: { code?: { enum?: string[] } };
            required?: string[];
          }
        >
      )[nombre];
    }

    const UPLOADS = [
      ['POST', '/api/ingestas', 'post'],
      ['POST', '/api/ingestas/preview', 'post'],
      ['POST', '/api/ingestas/commit', 'post'],
    ] as const;

    it.each(UPLOADS)(
      '%s %s declares a typed 400 whose optional code enum is PDF_PROTEGIDO | PDF_PASSWORD_INCORRECTA | SIN_MOVIMIENTOS',
      (_m, ruta, metodo) => {
        const op = document().paths?.[ruta]?.[metodo];
        const schema = componente(schemaRef(op, '400'));
        expect(schema.properties.code?.enum).toEqual([
          'PDF_PROTEGIDO',
          'PDF_PASSWORD_INCORRECTA',
          'SIN_MOVIMIENTOS',
        ]);
        expect(schema.required).not.toContain('code');
      },
    );

    it.each(UPLOADS)(
      '%s %s declares 409 CATALOGO_INCOMPLETO, 503 CATALOGO_NO_DISPONIBLE and a typed 500',
      (_m, ruta, metodo) => {
        const op = document().paths?.[ruta]?.[metodo];
        const c409 = componente(schemaRef(op, '409'));
        const c503 = componente(schemaRef(op, '503'));
        expect(c409.properties.code?.enum).toEqual(['CATALOGO_INCOMPLETO']);
        expect(c409.required).toContain('code');
        expect(c503.properties.code?.enum).toEqual(['CATALOGO_NO_DISPONIBLE']);
        expect(c503.required).toContain('code');
        expect(schemaRef(op, '500')).toBeDefined();
      },
    );

    it.each([
      ['patch', '/api/categorias/{id}'],
      ['delete', '/api/categorias/{id}'],
    ] as const)('%s %s declares 403 CATEGORIA_INTERNA', (metodo, ruta) => {
      const op = document().paths?.[ruta]?.[metodo];
      const schema = componente(schemaRef(op, '403'));
      expect(schema.properties.code?.enum).toEqual(['CATEGORIA_INTERNA']);
      expect(schema.required).toContain('code');
    });

    it('no other categorias or patrones operation declares 403 (only system categories are protected)', () => {
      const { paths } = document();
      const con403 = [
        ['post', '/api/categorias'],
        ['get', '/api/categorias'],
        ['post', '/api/patrones'],
        ['patch', '/api/patrones/{id}'],
        ['delete', '/api/patrones/{id}'],
      ].filter(
        ([m, r]) =>
          (paths?.[r] as Record<string, { responses?: Json }>)?.[m]
            ?.responses?.['403'] !== undefined,
      );
      expect(con403).toEqual([]);
    });
  });

  describe('list ordering is documented', () => {
    const casos: Array<[string, string, string, RegExp]> = [
      [
        'get',
        '/api/categorias',
        'GET /api/categorias',
        /Ordering:.*`nombre` ascending.*es-CL.*`id`.*`prioridad`/s,
      ],
      [
        'get',
        '/api/ingestas',
        'GET /api/ingestas',
        /Ordering:.*newest first.*`id` descending/s,
      ],
      [
        'get',
        '/api/buckets/{bucket}',
        'GET /api/buckets/{bucket}',
        /Ordering:.*amount descending.*`fecha` ascending.*`id`/s,
      ],
      [
        'get',
        '/api/buckets/{bucket}/detalle',
        'GET /api/buckets/{bucket}/detalle',
        /Ordering:.*`grupos`.*`subtotal` descending.*Sin categoría.*last.*`transacciones`.*`fecha` ascending/s,
      ],
      [
        'get',
        '/api/ingresos/mes',
        'GET /api/ingresos/mes',
        /Ordering:.*`fecha` ascending.*`id`/s,
      ],
      [
        'get',
        '/api/resumen/anual',
        'GET /api/resumen/anual',
        /Ordering:.*12.*January.*December/s,
      ],
      [
        'get',
        '/api/movimientos',
        'GET /api/movimientos',
        /Ordering:.*`fecha` ascending.*`id`/s,
      ],
    ];

    it.each(casos)('%s %s', (metodo, ruta, _nombre, patron) => {
      const op = buildOpenApiDocument().paths?.[ruta]?.[metodo as 'get'] as {
        description?: string;
      };
      expect(op.description).toMatch(patron);
    });
  });

  describe('nullable enums (OpenAPI 3.0.3: `nullable` does not extend `enum`)', () => {
    // No strict OpenAPI 3.0 validator (ajv with the 3.0 meta-schema) is a direct
    // dependency of apps/api, and the repo's supply-chain policy forbids adding
    // one for this, so we assert the structural rule the validators enforce.
    const collect = (node: unknown, out: Record<string, unknown>[] = []) => {
      if (Array.isArray(node)) node.forEach((n) => collect(n, out));
      else if (node && typeof node === 'object') {
        const o = node as Record<string, unknown>;
        if (o.nullable === true && Array.isArray(o.enum)) out.push(o);
        Object.values(o).forEach((v) => collect(v, out));
      }
      return out;
    };

    it('lists null (and keeps nullable: true) in every nullable enum, incl. estadoSemaforo/estadoGlobal', () => {
      const found = collect(buildOpenApiDocument());

      expect(found.length).toBeGreaterThanOrEqual(4);
      for (const schema of found) {
        expect(schema.enum).toEqual(['verde', 'amarillo', 'rojo', null]);
        expect(schema.nullable).toBe(true);
      }
    });

    it('listNullInNullableEnums only touches nullable enums and is idempotent', () => {
      const doc = {
        a: { nullable: true, enum: ['x'] },
        b: { enum: ['y'] },
        c: { nullable: true, enum: ['z', null] },
      };

      listNullInNullableEnums(doc);
      listNullInNullableEnums(doc);

      expect(doc).toEqual({
        a: { nullable: true, enum: ['x', null] },
        b: { enum: ['y'] },
        c: { nullable: true, enum: ['z', null] },
      });
    });
  });
});
