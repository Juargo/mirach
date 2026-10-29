package app.mirachbudget.android.core.api.generated.apis

import app.mirachbudget.android.core.api.generated.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import app.mirachbudget.android.core.api.generated.models.ApiAuthAppleTokenPostRequest
import app.mirachbudget.android.core.api.generated.models.ApiAuthGoogleTokenPostRequest
import app.mirachbudget.android.core.api.generated.models.ApiAuthLoginPostRequest
import app.mirachbudget.android.core.api.generated.models.ApiCategoriasIdPatchRequest
import app.mirachbudget.android.core.api.generated.models.ApiCategoriasPostRequest
import app.mirachbudget.android.core.api.generated.models.ApiCuentaDeleteRequest
import app.mirachbudget.android.core.api.generated.models.ApiKeyUnauthorizedResponse
import app.mirachbudget.android.core.api.generated.models.ApiMovimientosPostRequest
import app.mirachbudget.android.core.api.generated.models.ApiPatronesIdPatchRequest
import app.mirachbudget.android.core.api.generated.models.ApiPatronesPostRequest
import app.mirachbudget.android.core.api.generated.models.ApiPerfilGoogleDesvincularPostRequest
import app.mirachbudget.android.core.api.generated.models.ApiPerfilPasswordPatchRequest
import app.mirachbudget.android.core.api.generated.models.ApiPerfilPatchRequest
import app.mirachbudget.android.core.api.generated.models.ApiTransaccionesIdCategoriaPatchRequest
import app.mirachbudget.android.core.api.generated.models.AuthCapabilitiesResponse
import app.mirachbudget.android.core.api.generated.models.AuthLoginResponse
import app.mirachbudget.android.core.api.generated.models.AuthMeResponse
import app.mirachbudget.android.core.api.generated.models.BucketDetalleMesResponse
import app.mirachbudget.android.core.api.generated.models.CatalogoErrorResponse
import app.mirachbudget.android.core.api.generated.models.CatalogoResponse
import app.mirachbudget.android.core.api.generated.models.CategoriaInternaErrorResponse
import app.mirachbudget.android.core.api.generated.models.CategoriaResponse
import app.mirachbudget.android.core.api.generated.models.CommitIngestaResponse
import app.mirachbudget.android.core.api.generated.models.CredentialsUnauthorizedResponse
import app.mirachbudget.android.core.api.generated.models.CuentaErrorResponse
import app.mirachbudget.android.core.api.generated.models.DetalleBucketResponse
import app.mirachbudget.android.core.api.generated.models.IngestaCatalogoIncompletoResponse
import app.mirachbudget.android.core.api.generated.models.IngestaCatalogoNoDisponibleResponse
import app.mirachbudget.android.core.api.generated.models.IngestaErrorResponse
import app.mirachbudget.android.core.api.generated.models.IngestaUploadResponse
import app.mirachbudget.android.core.api.generated.models.IngestasListResponse
import app.mirachbudget.android.core.api.generated.models.IngresosMesResponse
import app.mirachbudget.android.core.api.generated.models.MovimientosMesResponse
import app.mirachbudget.android.core.api.generated.models.PatronResponse
import app.mirachbudget.android.core.api.generated.models.PerfilErrorResponse
import app.mirachbudget.android.core.api.generated.models.PerfilPresupuestoResponse
import app.mirachbudget.android.core.api.generated.models.PerfilPresupuestoUpdateRequest
import app.mirachbudget.android.core.api.generated.models.PeriodosResponse
import app.mirachbudget.android.core.api.generated.models.PreviewIngestaResponse
import app.mirachbudget.android.core.api.generated.models.ReevaluarCategoriasResponse
import app.mirachbudget.android.core.api.generated.models.RegistrarMovimientoManualResponse
import app.mirachbudget.android.core.api.generated.models.ResumenAnualResponse
import app.mirachbudget.android.core.api.generated.models.ResumenMesResponse
import app.mirachbudget.android.core.api.generated.models.SemaforoDetalleResponse
import app.mirachbudget.android.core.api.generated.models.ServerErrorResponse
import app.mirachbudget.android.core.api.generated.models.TransaccionesCategoriaResponse
import app.mirachbudget.android.core.api.generated.models.UnauthorizedResponse
import app.mirachbudget.android.core.api.generated.models.VersionResponse
import app.mirachbudget.android.core.api.generated.models.VincularGoogleResponse

import okhttp3.MultipartBody

interface DefaultApi {
    /**
     * POST api/auth/apple/token
     * Authenticate with a native Apple identity token (mobile)
     * Public endpoint (requires x-api-key only, session-public — no prior session needed) that verifies an Apple identity token (RS256 signature against Apple&#39;s JWKS, iss, aud &#x3D; the app&#39;s bundle ID, exp) and its nonce: the app sends the RAW nonce and passes its SHA-256 (hex) to Apple; the server hashes the raw value and compares it with the token&#39;s nonce claim. The identity is the token&#39;s &#x60;sub&#x60;, never the email: an existing user is matched by appleSub; otherwise a VERIFIED, non-private-relay email may link to an existing account (unless that account already has a different appleSub); otherwise a new passwordless account is created (signup-on-first-login). Apple delivers the email and the name only on the FIRST authorization and only if the app requested the email scope — the name travels in &#x60;nombre&#x60; (it is not in the token); a NEW user arriving without an email is rejected. The 200 body is identical for login and signup and never reveals which one happened. Every failure cause — well-formed JSON with an invalid body, invalid/expired/wrong-audience token, nonce mismatch, unverified or missing email, an email linked to a different appleSub, a lost creation race, or a JWKS/network failure — produces the identical 401 body used by POST /api/auth/login (anti-enumeration). No Set-Cookie: mobile uses Bearer + SecureStore. A successful login of a PRE-EXISTING user releases this endpoint&#39;s own IP rate-limit budget; a successful signup never does. 404 when APPLE_BUNDLE_ID is not configured. A syntactically malformed JSON body never reaches the handler: the shared body parser rejects it and the shared error handler answers a generic 500, not this 401.
     * Responses:
     *  - 200: Authentication succeeded — identical shape to POST /api/auth/login.
     *  - 401: Missing or invalid `x-api-key` (`code` API_KEY_INVALIDA), or the credential check failed (`code` CREDENCIALES_INVALIDAS — one generic code for every cause, never echoes the credential).
     *  - 404: Sign in with Apple is not active — APPLE_BUNDLE_ID is not configured.
     *  - 429: Rate-limited: too many attempts from this IP (own budget, distinct from the other auth endpoints).
     *
     * @param apiAuthAppleTokenPostRequest  (optional)
     * @return [AuthLoginResponse]
     */
    @POST("api/auth/apple/token")
    suspend fun apiAuthAppleTokenPost(@Body apiAuthAppleTokenPostRequest: ApiAuthAppleTokenPostRequest? = null): Response<AuthLoginResponse>

    /**
     * GET api/auth/capabilities
     * Discover which login methods (Google web/mobile, Apple) are active
     * Public endpoint (requires x-api-key only, session-public — no prior session needed), always mounted regardless of whether GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET (web) or GOOGLE_CLIENT_ID_ANDROID/GOOGLE_CLIENT_ID_IOS (mobile) are configured (AC-10). Each client reads its own field (googleLoginEnabled or googleLoginMobileEnabled) before rendering its own Google-login affordance; appleLoginEnabled reports whether APPLE_BUNDLE_ID is configured (Sign in with Apple).
     * Responses:
     *  - 200: Current activation state of Google and Apple login.
     *  - 401: Missing or invalid `x-api-key` (`code` API_KEY_INVALIDA).
     *
     * @return [AuthCapabilitiesResponse]
     */
    @GET("api/auth/capabilities")
    suspend fun apiAuthCapabilitiesGet(): Response<AuthCapabilitiesResponse>

    /**
     * GET api/auth/google/callback
     * Complete Google sign-in
     * Public endpoint (requires x-api-key only, session-public) — Google&#39;s redirect target after consent. Validates &#x60;state&#x60; against the &#x60;md_oauth&#x60; cookie and the &#x60;id_token&#x60; (signature/iss/aud/exp/nonce) before any identity resolution (AUTH-12), then resolves the identity — matching an existing user by googleSub or email, or CREATING a new passwordless account on first verified login (signup-on-first-login, ADR-041) — and issues a session equivalent to password login (AUTH-13). Every failure cause — bad state, bad token, unverified email, a lost account-creation race, an unexpected infra fault — produces the identical 302 redirect (AUTH-15): this contract intentionally does not distinguish them, including whether the session belongs to a pre-existing or a just-created account. DUAL MODE (US-041, VINC041-02/03): when &#x60;md_oauth&#x60; carries a signed &#x60;link&#x60; marker (set by POST /api/perfil/google/vincular), this same endpoint completes an EXPLICIT LINK instead of a login/signup — it binds a Google identity to the CALLER&#39;s own account, issues NO new session, never creates an account, and redirects to &#x60;/configuracion?google&#x3D;vinculado&#x60; on success or &#x60;/configuracion?google&#x3D;error&#x60; on a modelled failure. A &#x60;link&#x60; marker that fails its integrity check rejects the WHOLE callback to the generic &#x60;/login?error&#x3D;google&#x60; — it never falls back to the login/signup path.
     * Responses:
     *  - 302: Success: sets `md_session` and redirects to \"/\". Failure (any cause): redirects to \"/login?error=google\" with no session — see AUTH-15.
     *  - 401: Missing or invalid `x-api-key` (`code` API_KEY_INVALIDA).
     *  - 403: Rejected: request is not a top-level navigation (same Fetch-Metadata guard as initiate, design §3).
     *  - 404: Google login is not active — GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are not both configured (AUTH-16).
     *  - 429: Rate-limited: too many Google login attempts from this IP (budget shared with initiate, design §6.4).
     *
     * @return [Unit]
     */
    @GET("api/auth/google/callback")
    suspend fun apiAuthGoogleCallbackGet(): Response<Unit>

    /**
     * GET api/auth/google
     * Start Google sign-in
     * Public endpoint (requires x-api-key only, session-public) that starts the OIDC Authorization Code + PKCE round trip with Google (AUTH-11). Must be reached via a true top-level browser navigation — see AUTH-17. Sets the short-lived &#x60;md_oauth&#x60; cookie (state/nonce/PKCE) and redirects to Google. 404 when Google login is not active (AUTH-16) — see GET /api/auth/capabilities.
     * Responses:
     *  - 302: Redirects to Google's OAuth 2.0 authorization endpoint.
     *  - 401: Missing or invalid `x-api-key` (`code` API_KEY_INVALIDA).
     *  - 403: Rejected: request is not a top-level navigation (anti-embed Fetch-Metadata guard).
     *  - 404: Google login is not active — GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are not both configured (AUTH-16).
     *  - 429: Rate-limited: too many Google login attempts from this IP (budget shared with the callback, design §6.4).
     *
     * @return [Unit]
     */
    @GET("api/auth/google")
    suspend fun apiAuthGoogleGet(): Response<Unit>

    /**
     * POST api/auth/google/token
     * Authenticate with a native Google id_token (mobile)
     * Public endpoint (requires x-api-key only, session-public — no prior session needed) that verifies a device-obtained Google id_token (AUTH-19) and resolves the identity — matching an existing user by googleSub or email, or CREATING a new passwordless account on first verified login (signup-on-first-login, ADR-041, same use case as the web callback) — issuing a session identical in shape to POST /api/auth/login (AUTH-20) for BOTH outcomes; the response never reveals whether the account is pre-existing or just-created. Every failure cause — invalid/expired/wrong-audience token, unverified email, an email already linked to a different googleSub, a lost account-creation race, or a JWKS/network failure — produces the identical 401 body used by POST /api/auth/login (AUTH-21, anti-enumeration); a well-formed JSON body with an invalid shape takes that same 401, while a syntactically malformed JSON body never reaches the handler (the shared body parser rejects it and the shared error handler answers a generic 500). No Set-Cookie: mobile uses Bearer + SecureStore. A successful login of a PRE-EXISTING user releases this endpoint&#39;s own IP rate-limit budget; a successful SIGNUP never does (mass-signup defense, ADR-041 Consecuencias) — the budget still caps the rate of new accounts from a single IP. 404 when neither GOOGLE_CLIENT_ID_ANDROID nor GOOGLE_CLIENT_ID_IOS is configured (AUTH-22) — independent of GET /api/auth/google&#39;s activation gate.
     * Responses:
     *  - 200: Authentication succeeded — identical shape to POST /api/auth/login.
     *  - 401: Missing or invalid `x-api-key` (`code` API_KEY_INVALIDA), or the credential check failed (`code` CREDENCIALES_INVALIDAS — one generic code for every cause, never echoes the credential).
     *  - 404: Google login mobile is not active — neither GOOGLE_CLIENT_ID_ANDROID nor GOOGLE_CLIENT_ID_IOS is configured (AUTH-22).
     *  - 429: Rate-limited: too many attempts from this IP (own budget, distinct from /auth/login and GET /api/auth/google, design §6.4).
     *
     * @param apiAuthGoogleTokenPostRequest  (optional)
     * @return [AuthLoginResponse]
     */
    @POST("api/auth/google/token")
    suspend fun apiAuthGoogleTokenPost(@Body apiAuthGoogleTokenPostRequest: ApiAuthGoogleTokenPostRequest? = null): Response<AuthLoginResponse>

    /**
     * POST api/auth/login
     * Authenticate with email and password
     * Public endpoint (requires x-api-key only, session-public — no prior session needed) that authenticates a user and returns a session token (AUTH-01). Sets the &#x60;md_session&#x60; cookie (Set-Cookie) in addition to the JSON body.
     * Responses:
     *  - 200: Authentication succeeded.
     *  - 401: Missing or invalid `x-api-key` (`code` API_KEY_INVALIDA), or the credential check failed (`code` CREDENCIALES_INVALIDAS — one generic code for every cause, never echoes the credential).
     *  - 429: Rate-limited: too many failed login attempts from this IP/email combination.
     *
     * @param apiAuthLoginPostRequest  (optional)
     * @return [AuthLoginResponse]
     */
    @POST("api/auth/login")
    suspend fun apiAuthLoginPost(@Body apiAuthLoginPostRequest: ApiAuthLoginPostRequest? = null): Response<AuthLoginResponse>

    /**
     * POST api/auth/logout
     * End the current session
     * Public endpoint (requires x-api-key only, session-public) that invalidates the current session token (if any) and clears the &#x60;md_session&#x60; cookie. Always succeeds — an already missing or invalid token does not produce an error.
     * Responses:
     *  - 204: Session ended (or was already absent). No response body.
     *  - 401: Missing or invalid `x-api-key` (`code` API_KEY_INVALIDA).
     *
     * @return [Unit]
     */
    @POST("api/auth/logout")
    suspend fun apiAuthLogoutPost(): Response<Unit>

    /**
     * GET api/auth/me
     * Current session identity
     * Authenticated endpoint returning the identity of the current session (AUTH-09). Requires x-api-key + a valid session.
     * Responses:
     *  - 200: Identity of the authenticated session.
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *
     * @return [AuthMeResponse]
     */
    @GET("api/auth/me")
    suspend fun apiAuthMeGet(): Response<AuthMeResponse>

    /**
     * GET api/buckets/{bucket}/detalle
     * Bucket detail grouped by category for a month
     * Authenticated sibling detail endpoint to GET /api/buckets/{bucket} (US-051): returns the month×bucket detail GROUPED by category — a header with totals and % vs meta, and category groups carrying ALL their transactions (BigInt-safe strings, no account PII per MBD-08). Accepts only the three spend buckets (Necesidades, Deseos, Ahorro); Ingreso is out of scope (US-052) and rejected with a scrubbed 400. Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation, ISO-01/ISO-02). Ordering: &#x60;grupos&#x60; by &#x60;subtotal&#x60; descending, ties by category name (es-CL), with the synthetic \&quot;Sin categoría\&quot; group always last; within a group, &#x60;transacciones&#x60; by amount (&#x60;monto&#x60;) descending, then &#x60;fecha&#x60; ascending, then &#x60;id&#x60; ascending.
     * Responses:
     *  - 200: Month×bucket detail grouped by category for the resolved period (MBD-01/02/03/05/08).
     *  - 400: Invalid bucket (outside the 4-bucket allowlist, e.g. Ingresos) or invalid periodo — both domain-level (BucketInvalidoError / PeriodoInvalidoError), scrubbed messages.
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *
     * @param bucket Bucket name (raw path param). Validated against the domain enum by the use case, not this schema.
     * @param periodo Month period, format YYYY-MM (e.g. 2026-07). Absent defaults to the latest month with at least one transaction for this user, falling back to the current month when the user has none (issue #747). Format is validated by the domain, not this schema. (optional)
     * @return [BucketDetalleMesResponse]
     */
    @GET("api/buckets/{bucket}/detalle")
    suspend fun apiBucketsBucketDetalleGet(@Path("bucket") bucket: kotlin.String, @Query("periodo") periodo: kotlin.String? = null): Response<BucketDetalleMesResponse>

    /**
     * GET api/buckets/{bucket}
     * Bucket drill-down
     * Authenticated endpoint returning the transaction detail for a single spend bucket (US-017). Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation). Ordering: transactions by amount descending, then &#x60;fecha&#x60; ascending, then &#x60;id&#x60; ascending.
     * Responses:
     *  - 200: Bucket detail for the resolved period.
     *  - 400: Invalid bucket (unrecognized value) or invalid periodo — both domain-level (BucketInvalidoError / PeriodoInvalidoError).
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *
     * @param bucket Bucket name (raw path param). Validated against the domain enum by the use case, not this schema.
     * @param periodo Month period, format YYYY-MM (e.g. 2026-07). Absent defaults to the latest month with at least one transaction for this user, falling back to the current month when the user has none (issue #747). Format is validated by the domain, not this schema. (optional)
     * @return [DetalleBucketResponse]
     */
    @GET("api/buckets/{bucket}")
    suspend fun apiBucketsBucketGet(@Path("bucket") bucket: kotlin.String, @Query("periodo") periodo: kotlin.String? = null): Response<DetalleBucketResponse>

    /**
     * GET api/categorias
     * List the caller&#39;s category catalog
     * Authenticated endpoint returning the caller&#39;s own categories with their nested classification patterns and an all-history &#x60;transaccionesCount&#x60; per category — the caller-scoped impact preview for a destructive delete (US-038, CAT038-02; US-039, CAT039-01). Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation). Ordering: categories by &#x60;nombre&#x60; ascending (es-CL collation, independent of the database), ties by &#x60;id&#x60; ascending; each category&#39;s nested &#x60;patrones&#x60; by &#x60;prioridad&#x60; ascending, then &#x60;patron&#x60;, then &#x60;id&#x60;.
     * Responses:
     *  - 200: The caller's full catalog.
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *
     * @return [CatalogoResponse]
     */
    @GET("api/categorias")
    suspend fun apiCategoriasGet(): Response<CatalogoResponse>

    /**
     * DELETE api/categorias/{id}
     * Delete a category
     * Authenticated endpoint that deletes a category and cascades its patterns, atomically (US-038, CAT038-04 as modified by US-039). The delete always succeeds for a category owned by the caller, whether it is referenced by transactions or not. Every Transaccion that referenced the deleted category survives with categoriaId: null and its original bucketId unchanged — no money moves between buckets. Requires x-api-key + a valid session.
     * Responses:
     *  - 204: Category (and its patterns) deleted. No response body.
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *  - 403: The category is a protected system category (`esInterna: true`, the per-bucket \"Desconocido\"): it cannot be renamed, re-bucketed or deleted. `code` CATEGORIA_INTERNA.
     *  - 404: Anti-enumeration: the category does not exist or does not belong to the authenticated user.
     *
     * @param id 
     * @return [Unit]
     */
    @DELETE("api/categorias/{id}")
    suspend fun apiCategoriasIdDelete(@Path("id") id: kotlin.String): Response<Unit>

    /**
     * PATCH api/categorias/{id}
     * Rename and/or re-bucket a category
     * Authenticated endpoint that partially updates a category (US-038, CAT038-03). At least one of &#x60;nombre&#x60;/&#x60;bucket&#x60; MUST be present. When &#x60;bucket&#x60; actually changes, every historical Transaccion pointing at the category is re-stamped atomically. Requires x-api-key + a valid session.
     * Responses:
     *  - 200: Category updated.
     *  - 400: Invalid nombre/bucket, an empty body, or a malformed request body.
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *  - 403: The category is a protected system category (`esInterna: true`, the per-bucket \"Desconocido\"): it cannot be renamed, re-bucketed or deleted. `code` CATEGORIA_INTERNA.
     *  - 404: Anti-enumeration: the category does not exist or does not belong to the authenticated user.
     *  - 409: A category with that nombre already exists for this user (case-insensitive).
     *
     * @param id 
     * @param apiCategoriasIdPatchRequest  (optional)
     * @return [CategoriaResponse]
     */
    @PATCH("api/categorias/{id}")
    suspend fun apiCategoriasIdPatch(@Path("id") id: kotlin.String, @Body apiCategoriasIdPatchRequest: ApiCategoriasIdPatchRequest? = null): Response<CategoriaResponse>

    /**
     * POST api/categorias
     * Create a category
     * Authenticated endpoint that creates a category owned by the caller (US-038, CAT038-01), optionally with its classification patrones created atomically in the same call (CAT038-10/11) — when &#x60;patrones&#x60; is omitted or empty, the contract is byte-identical to the pre-existing behavior. Requires x-api-key + a valid session.
     * Responses:
     *  - 201: Category created, with its created patrones (if any) nested.
     *  - 400: Invalid nombre/bucket, a malformed request body, or a nested patrón that failed validation (CAT038-11) — in the latter case the body carries `indice`, the zero-based position of the offending entry within the submitted `patrones` array.
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *  - 409: A category with that nombre already exists for this user (case-insensitive), or a nested patrón collides with one already owned by the caller or with another entry in the same submitted `patrones` array (CAT038-11) — the latter case carries `indice`.
     *
     * @param apiCategoriasPostRequest  (optional)
     * @return [CategoriaResponse]
     */
    @POST("api/categorias")
    suspend fun apiCategoriasPost(@Body apiCategoriasPostRequest: ApiCategoriasPostRequest? = null): Response<CategoriaResponse>

    /**
     * DELETE api/cuenta
     * Delete the current account and all its data
     * Authenticated endpoint that permanently deletes the CALLER&#39;s account in one transaction: every session (all devices), transaction, ingestion, classification pattern, category, bank account and the user itself. Requires x-api-key + a valid session and the explicit body confirmation \&quot;ELIMINAR\&quot; (a valid session alone is not enough). Irreversible. External identity tokens are revoked best-effort first; a revocation failure never blocks the deletion. The session cookie is cleared on success; a repeated call with the now-deleted session answers 401.
     * Responses:
     *  - 204: Account and data deleted. No response body.
     *  - 400: Missing or wrong confirmation (code CONFIRMACION_INVALIDA). Nothing was deleted.
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *
     * @param apiCuentaDeleteRequest  (optional)
     * @return [Unit]
     */
    @DELETE("api/cuenta")
    suspend fun apiCuentaDelete(@Body apiCuentaDeleteRequest: ApiCuentaDeleteRequest? = null): Response<Unit>

    /**
     * POST api/ingestas/commit
     * Commit a bank statement import with optional edits overlay (US-057)
     * Authenticated endpoint — the second step of the preview → commit flow. Re-parses the same file, deduplicates against the calling user&#39;s history, applies the optional classification overlay (&#x60;edits&#x60; JSON text field, ≤256 KB), auto-classifies remaining rows, and persists atomically. New duplicates found at commit time are omitted and counted in &#x60;duplicadosOmitidos&#x60; (commit never aborts on duplicates, CA-03). Absent/empty &#x60;edits&#x60; ⇒ pure auto-classify (equivalent to the deprecated one-shot for the transacciones payload). Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation). Overlay errors (malformed edits, out-of-range rowIndex, cross-tenant categoriaId) return 400 and persist nothing (D-03/D-04/D-10).
     * Responses:
     *  - 201: Import committed and persisted. Response carries per-row bucket + categoriaId.
     *  - 400: Invalid request or file. `code` PDF_PROTEGIDO: the PDF is encrypted and no `password` was sent; PDF_PASSWORD_INCORRECTA: the `password` does not unlock it; SIN_MOVIMIENTOS: the file is valid but holds zero movements. Every other cause (missing `file` field, disallowed extension, unrecognized bank, invalid structure/normalization, unreadable PDF, invalid date range, file over 10 MB) carries `message` only, no `code`. Also the overlay errors, `message` only: malformed `edits` (EdicionesInvalidasError), out-of-range `rowIndex` (RowIndexFueraDeRangoError), cross-tenant `categoriaId` (CategoriaFueraDeCatalogoError), `edits` over 256 KB. Nothing is persisted. Amounts are scrubbed from every error message (ADR-013).
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *  - 409: The category catalog is available but incomplete (CatalogoIncompletoError): the default \"Desconocido\" category of a bucket is missing. `code` CATALOGO_INCOMPLETO. Permanent — the file is fine, the account state is not; retrying the same request does not help.
     *  - 500: Infrastructure fault (DB) — ensure, dedup or persist failure (PersistenciaFallidaError). Body is `{ message }` without `code`. Retryable.
     *  - 503: The classification catalog is unreachable (`code` CATALOGO_NO_DISPONIBLE, issue #778 slice 5a) — transient, distinct from the permanent 409. Fail-closed: nothing is persisted (D-10); retrying later may succeed.
     *
     * @param file Bank statement file (.xlsx or .pdf). Extension/bank-format validation is a domain rule (ExtensionNoPermitidaError / BancoNoReconocidoError), not this schema.
     * @param edits JSON text field carrying the edit overlay: Array&lt;{ rowIndex: number, categoriaId: string | null }&gt;. Absent or empty ⇒ empty overlay (pure auto-classify commit). Max 256 KB, enforced by multer limits.fieldSize (D-02). (optional)
     * @param password Optional password to unlock an encrypted PDF statement (design.md D-08). Absent or empty ⇒ file is treated as unprotected (byte-identical to pre-change behavior). (optional)
     * @return [CommitIngestaResponse]
     */
    @Multipart
    @POST("api/ingestas/commit")
    suspend fun apiIngestasCommitPost(@Part file: MultipartBody.Part, @Part("edits") edits: kotlin.String? = null, @Part("password") password: kotlin.String? = null): Response<CommitIngestaResponse>

    /**
     * GET api/ingestas
     * List ingestas
     * Authenticated endpoint returning the per-user ingesta history (US-004/US-018). Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation). Ordering: newest first — &#x60;fecha&#x60; (when the ingesta was created) descending, ties by &#x60;id&#x60; descending.
     * Responses:
     *  - 200: Ingesta list for the authenticated user.
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *
     * @return [IngestasListResponse]
     */
    @GET("api/ingestas")
    suspend fun apiIngestasGet(): Response<IngestasListResponse>

    /**
     * DELETE api/ingestas/{id}
     * Delete an ingesta
     * Authenticated endpoint that cascade-deletes an ingesta and its transactions (US-018, ING-01/ING-02). Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation).
     * Responses:
     *  - 204: Ingesta deleted. No response body.
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *  - 404: Anti-enumeration: the ingesta does not exist or does not belong to the authenticated user.
     *
     * @param id Ingesta id (raw path param). Existence/ownership is checked by the use case, not this schema.
     * @return [Unit]
     */
    @DELETE("api/ingestas/{id}")
    suspend fun apiIngestasIdDelete(@Path("id") id: kotlin.String): Response<Unit>

    /**
     * POST api/ingestas
     * Upload a bank statement (deprecated — use POST /api/ingestas/commit)
     * Authenticated endpoint that detects the bank, validates structure, normalizes, persists, and categorizes a bank statement file (US-004/US-005/US-011). Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation). DEPRECATED at US-057 (D-14/CA-05): this one-shot endpoint is superseded by the two-step POST /api/ingestas/preview → POST /api/ingestas/commit flow. Physical removal is tracked by US-061. Behavior is UNCHANGED — existing callers (mobile, ADR-026) continue to work.
     * Responses:
     *  - 200: Upload processed and persisted.
     *  - 400: Invalid request or file. `code` PDF_PROTEGIDO: the PDF is encrypted and no `password` was sent; PDF_PASSWORD_INCORRECTA: the `password` does not unlock it; SIN_MOVIMIENTOS: the file is valid but holds zero movements. Every other cause (missing `file` field, disallowed extension, unrecognized bank, invalid structure/normalization, unreadable PDF, invalid date range, file over 10 MB) carries `message` only, no `code`.
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *  - 409: The category catalog is available but incomplete (CatalogoIncompletoError): the default \"Desconocido\" category of a bucket is missing. `code` CATALOGO_INCOMPLETO. Permanent — the file is fine, the account state is not; retrying the same request does not help.
     *  - 500: Persistence failure (PersistenciaFallidaError) — infrastructure fault, not the uploaded file. Body is `{ message }` without `code`.
     *  - 503: Classification is unavailable (`code` CATALOGO_NO_DISPONIBLE): the classification catalog is unreachable (issue #778 slice 5a), OR the post-persist bucket-classification write failed and the import was rolled back (slice 5a-bis). Transient and distinct from the permanent 409. Nothing remains persisted; retrying later may succeed.
     *
     * @param file Bank statement file (.xlsx or .pdf). Extension/bank-format validation is a domain rule (ExtensionNoPermitidaError / BancoNoReconocidoError), not this schema.
     * @return [IngestaUploadResponse]
     */
    @Deprecated("This api was deprecated")
    @Multipart
    @POST("api/ingestas")
    suspend fun apiIngestasPost(@Part file: MultipartBody.Part): Response<IngestaUploadResponse>

    /**
     * POST api/ingestas/preview
     * Preview a bank statement (dry run, US-057)
     * Authenticated endpoint that detects the bank, validates structure, deduplicates and auto-classifies a bank statement WITHOUT persisting anything (US-057). CANONICAL response: &#x60;resumen&#x60; + &#x60;filas&#x60; (ALL rows, no sample cap, with per-row dedup status &#x60;esDuplicado&#x60; and classification &#x60;sugerido&#x60;). DEPRECATED fields (removed by US-061 alongside the one-shot endpoint): &#x60;estructura&#x60; (mirror of &#x60;resumen.totalFilas&#x60;) and &#x60;muestra&#x60; (first 50 rows in the old 4-field shape) — kept for shipped clients (deployed mobile APK) and clients pending migration. Requires x-api-key + a valid session; dedup is scoped to the calling user (RNF-SEC-006).
     * Responses:
     *  - 200: Preview sample computed (not persisted).
     *  - 400: Invalid request or file. `code` PDF_PROTEGIDO: the PDF is encrypted and no `password` was sent; PDF_PASSWORD_INCORRECTA: the `password` does not unlock it; SIN_MOVIMIENTOS: the file is valid but holds zero movements. Every other cause (missing `file` field, disallowed extension, unrecognized bank, invalid structure/normalization, unreadable PDF, invalid date range, file over 10 MB) carries `message` only, no `code`. Also: a `password` longer than 500 characters (`message` only).
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *  - 409: The category catalog is available but incomplete (CatalogoIncompletoError): the default \"Desconocido\" category of a bucket is missing. `code` CATALOGO_INCOMPLETO. Permanent — the file is fine, the account state is not; retrying the same request does not help.
     *  - 500: Defensive: PersistenciaFallidaError while reading the history for dedup — infrastructure fault. Body is `{ message }` without `code`.
     *  - 503: The classification catalog is unreachable (`code` CATALOGO_NO_DISPONIBLE, issue #778 slice 5a) — transient. Preview rejects rather than showing a degraded suggestion set the commit could never honor.
     *
     * @param file Bank statement file (.xlsx or .pdf). Extension/bank-format validation is a domain rule (ExtensionNoPermitidaError / BancoNoReconocidoError), not this schema.
     * @param password Optional password to unlock an encrypted PDF statement (design.md D-08). Absent or empty ⇒ file is treated as unprotected (byte-identical to pre-change behavior). (optional)
     * @return [PreviewIngestaResponse]
     */
    @Multipart
    @POST("api/ingestas/preview")
    suspend fun apiIngestasPreviewPost(@Part file: MultipartBody.Part, @Part("password") password: kotlin.String? = null): Response<PreviewIngestaResponse>

    /**
     * GET api/ingresos/mes
     * Monthly income list by origin (bank/Manual)
     * Authenticated sibling endpoint to GET /api/buckets/{bucket}/detalle (US-052): returns the monthly income detail — a header with the total Σ abono (BigInt-safe string) and count, and ALL transactions with their origin &#x3D; bank NAME verbatim (CA-02, MID-02) or \&quot;Manual\&quot;, never account PII (tipoCuenta/numeroCuenta, MID-06). Top-level path, NOT a buckets sub-resource: GET /api/buckets/Ingresos/detalle keeps rejecting Ingresos with its own scrubbed 400 (MBD-07, US-051). Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation, ISO-01/ISO-02). Ordering: &#x60;transacciones&#x60; by &#x60;fecha&#x60; ascending, ties by &#x60;id&#x60; ascending.
     * Responses:
     *  - 200: Monthly income list for the resolved period — exactly {total, conteo, transacciones} with origen = bank name verbatim or \"Manual\" (MID-01/02/03/05).
     *  - 400: Invalid periodo — malformed YYYY-MM value (domain-level, PeriodoMes VO → PeriodoInvalidoError, MID-04); the scrubbed message never echoes the raw input.
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *
     * @param periodo Month period, format YYYY-MM (e.g. 2026-07). Absent defaults to the latest month with at least one transaction for this user, falling back to the current month when the user has none (issue #747). Format is validated by the domain, not this schema. (optional)
     * @return [IngresosMesResponse]
     */
    @GET("api/ingresos/mes")
    suspend fun apiIngresosMesGet(@Query("periodo") periodo: kotlin.String? = null): Response<IngresosMesResponse>

    /**
     * GET api/movimientos
     * Monthly transaction list
     * Authenticated endpoint returning the consolidated monthly transaction list (US-014). Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation). Ordering: transactions by &#x60;fecha&#x60; ascending, ties by &#x60;id&#x60; ascending.
     * Responses:
     *  - 200: Monthly transaction list for the resolved period.
     *  - 400: Invalid periodo — either a transport-shape mismatch or a malformed YYYY-MM value (domain-level, PeriodoMes VO).
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *
     * @param periodo Month period, format YYYY-MM (e.g. 2026-07). Absent defaults to the latest month with at least one transaction for this user, falling back to the current month when the user has none (issue #747). Format is validated by the domain, not this schema. (optional)
     * @return [MovimientosMesResponse]
     */
    @GET("api/movimientos")
    suspend fun apiMovimientosGet(@Query("periodo") periodo: kotlin.String? = null): Response<MovimientosMesResponse>

    /**
     * DELETE api/movimientos/{id}
     * Delete a manual movement
     * Authenticated endpoint that deletes a Transaccion owned by the calling user with origen&#x3D;&#39;Manual&#39; (correccion-movimientos-manuales, ADR-040). Ingesta-born rows are never individually deletable — delete the whole ingesta instead (DELETE /api/ingestas/:id). Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation).
     * Responses:
     *  - 204: Movement deleted. No response body.
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *  - 404: Anti-enumeration: the transaction does not exist, does not belong to the authenticated user, or is not origen='Manual' (ingesta-born rows collapse into this same response).
     *
     * @param id Transaccion id (raw path param). Existence/ownership/provenance is checked by the use case, not this schema.
     * @return [Unit]
     */
    @DELETE("api/movimientos/{id}")
    suspend fun apiMovimientosIdDelete(@Path("id") id: kotlin.String): Response<Unit>

    /**
     * POST api/movimientos
     * Register a manual movement (type-first: Ingreso or Gasto)
     * Authenticated endpoint that registers a single hand-typed movement with no cartola (US-058, D-12). Type-first: &#x60;tipo&#x3D;Ingreso&#x60; auto-classifies to {bucket&#x3D;Ingreso, categoriaId&#x3D;null}; &#x60;tipo&#x3D;Gasto&#x60; requires &#x60;bucket&#x60; ∈ {Necesidades, Deseos, Ahorro} and a &#x60;categoriaId&#x60; from the caller&#39;s own catalog. The Ingreso variant is strict (stray &#x60;bucket&#x60;/&#x60;categoriaId&#x60; ⇒ 400, Q3 resolution). &#x60;monto&#x60; is a BigInt-safe decimal string (JSON number ⇒ 400). &#x60;fecha&#x60; must be YYYY-MM-DD; domain enforces ≤ today (future ⇒ 400). A per-user sentinel Account (banco&#x3D;&#39;Manual&#39;) is created lazily (MAN-04). The persisted row has &#x60;ingestaId&#x3D;null&#x60;, &#x60;origen&#x3D;&#39;Manual&#39;&#x60;, and is immune to &#x60;DELETE /api/ingestas/:id&#x60; (SQL NULL-equality, CA-04). Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation, ISO-01/ISO-02).
     * Responses:
     *  - 201: Movement registered. Response carries id, fecha (ISO), descripcion (plaintext), cargo/abono (BigInt-safe strings), bucket, categoriaId, and origen=\"Manual\" (D-08/D-12). No DB read-back — values sourced from the in-memory VO.
     *  - 400: Shape mismatch (Zod: stray fields on Ingreso, missing bucket/categoriaId on Gasto, monto as JSON number, wrong fecha format) OR domain validation failure (MovimientoManualInvalidoError: FECHA_FUTURA, DESCRIPCION_VACIA/LARGA, MONTO_INVALIDO/OVERFLOW, SIN_MONTOS, MONTO_NEGATIVO) OR catalog cascade failure (CategoriaFueraDeCatalogoError, BucketCategoriaNoConcuerdaError). Amounts are scrubbed from every error message (ADR-013).
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *  - 500: Infrastructure fault — sentinel upsert, catalog load, or Transaccion.create failed (PersistenciaFallidaError). Retryable.
     *
     * @param apiMovimientosPostRequest  (optional)
     * @return [RegistrarMovimientoManualResponse]
     */
    @POST("api/movimientos")
    suspend fun apiMovimientosPost(@Body apiMovimientosPostRequest: ApiMovimientosPostRequest? = null): Response<RegistrarMovimientoManualResponse>

    /**
     * DELETE api/patrones/{id}
     * Delete a classification pattern
     * Authenticated endpoint that deletes a pattern (US-038, CAT038-05/07). Requires x-api-key + a valid session.
     * Responses:
     *  - 204: Pattern deleted. No response body.
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *  - 404: Anti-enumeration: the pattern does not exist or does not belong to the authenticated user.
     *
     * @param id 
     * @return [Unit]
     */
    @DELETE("api/patrones/{id}")
    suspend fun apiPatronesIdDelete(@Path("id") id: kotlin.String): Response<Unit>

    /**
     * PATCH api/patrones/{id}
     * Update a classification pattern
     * Authenticated endpoint that partially updates a pattern (US-038, CAT038-05). &#x60;categoriaId&#x60; is NOT accepted — moving a pattern between categories is a non-goal. Requires x-api-key + a valid session.
     * Responses:
     *  - 200: Pattern updated.
     *  - 400: Invalid patron/matchType/prioridad, an invalid REGEX, an empty body, or a malformed request body.
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *  - 404: Anti-enumeration: the pattern does not exist or does not belong to the authenticated user.
     *  - 409: A pattern with that text already exists for this user (case-insensitive).
     *
     * @param id 
     * @param apiPatronesIdPatchRequest  (optional)
     * @return [PatronResponse]
     */
    @PATCH("api/patrones/{id}")
    suspend fun apiPatronesIdPatch(@Path("id") id: kotlin.String, @Body apiPatronesIdPatchRequest: ApiPatronesIdPatchRequest? = null): Response<PatronResponse>

    /**
     * POST api/patrones
     * Create a classification pattern
     * Authenticated endpoint that creates a classification pattern under one of the caller&#39;s own categories (US-038, CAT038-05/06). Requires x-api-key + a valid session.
     * Responses:
     *  - 201: Pattern created.
     *  - 400: Invalid patron/matchType/prioridad, an invalid REGEX (write-time compile check), or a malformed request body.
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *  - 404: Anti-enumeration: categoriaId does not exist or does not belong to the authenticated user.
     *  - 409: A pattern with that text already exists for this user (case-insensitive).
     *
     * @param apiPatronesPostRequest  (optional)
     * @return [PatronResponse]
     */
    @POST("api/patrones")
    suspend fun apiPatronesPost(@Body apiPatronesPostRequest: ApiPatronesPostRequest? = null): Response<PatronResponse>

    /**
     * POST api/perfil/google/desvincular
     * Unlink the Google identity from the current account
     * Authenticated endpoint (US-041, VINC041-05) that re-verifies the current password and clears the CALLER&#39;s own googleSub. Idempotent: a second call after success still responds 204. Rejected for a wrong current password (403 PERFIL_RECHAZADO), and when the account has no passwordHash (403 VINCULO_REQUIERE_PASSWORD — CA-03: an account may never be left without an access method). Mounted unconditionally, independent of whether Google login is currently active.
     * Responses:
     *  - 204: The Google identity is no longer linked.
     *  - 400: Malformed body.
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *  - 403: An incorrect current password, or the account has no passwordHash to fall back on.
     *
     * @param apiPerfilGoogleDesvincularPostRequest  (optional)
     * @return [Unit]
     */
    @POST("api/perfil/google/desvincular")
    suspend fun apiPerfilGoogleDesvincularPost(@Body apiPerfilGoogleDesvincularPostRequest: ApiPerfilGoogleDesvincularPostRequest? = null): Response<Unit>

    /**
     * POST api/perfil/google/vincular
     * Start linking a Google identity to the current account
     * Authenticated endpoint (US-041, VINC041-01/02) that re-verifies the current password and starts the OIDC round trip that will bind a Google identity to the CALLER&#39;s own account — no email matching is involved. Responds with the authorization URL and sets the short-lived &#x60;md_oauth&#x60; cookie carrying an HMAC-signed link intent; the client performs a top-level navigation to that URL. Completion happens at GET /api/auth/google/callback, which redirects to &#x60;/configuracion?google&#x3D;vinculado&#x60; or &#x60;/configuracion?google&#x3D;error&#x60; and issues NO new session. Rejected for a wrong current password (403 PERFIL_RECHAZADO), and when the account already carries a Google identity (409 GOOGLE_YA_VINCULADO — unlink first). 404 when Google login is not active (AUTH-16).
     * Responses:
     *  - 200: The Google OAuth authorization URL to navigate to. Sets Set-Cookie: md_oauth (state, nonce, codeVerifier, signed link).
     *  - 400: Malformed body.
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *  - 403: An incorrect current password.
     *  - 404: Google login is not active — GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are not both configured (AUTH-16).
     *  - 409: The account already has a linked Google identity.
     *  - 503: Google authorization is temporarily unreachable.
     *
     * @param apiPerfilGoogleDesvincularPostRequest  (optional)
     * @return [VincularGoogleResponse]
     */
    @POST("api/perfil/google/vincular")
    suspend fun apiPerfilGoogleVincularPost(@Body apiPerfilGoogleDesvincularPostRequest: ApiPerfilGoogleDesvincularPostRequest? = null): Response<VincularGoogleResponse>

    /**
     * PATCH api/perfil/password
     * Change the current user&#39;s password
     * Authenticated endpoint that changes the caller&#39;s own password (US-040, PERF040-03/05/06). &#x60;passwordActual&#x60; is REQUIRED. On success, EVERY OTHER active session belonging to the caller&#39;s user is revoked — the session that made this request stays valid. A wrong &#x60;passwordActual&#x60; returns the SAME generic 403 PERFIL_RECHAZADO used by &#x60;PATCH /api/perfil&#x60; (anti-enumeration) — 403, never 401: 401 is reserved for an invalid session. &#x60;passwordNueva&#x60; must satisfy the domain password rules (8-128 characters) — an invalid one is rejected with 400 PASSWORD_INVALIDA before any write. Requires x-api-key + a valid session.
     * Responses:
     *  - 204: Password changed. No response body — every other session was revoked.
     *  - 400: Malformed body, or an invalid passwordNueva.
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *  - 403: An incorrect current password.
     *
     * @param apiPerfilPasswordPatchRequest  (optional)
     * @return [Unit]
     */
    @PATCH("api/perfil/password")
    suspend fun apiPerfilPasswordPatch(@Body apiPerfilPasswordPatchRequest: ApiPerfilPasswordPatchRequest? = null): Response<Unit>

    /**
     * PATCH api/perfil
     * Update the current user profile (nombre and/or email)
     * Authenticated endpoint that updates the caller&#39;s own nombre and/or email (US-040, PERF040-01/02/03/04/07). &#x60;passwordActual&#x60; is REQUIRED whenever &#x60;email&#x60; is present. On an email change the ciphertext and blind index are rewritten together in one atomic update, so login keeps working with the NEW address and stops working with the old one. A wrong &#x60;passwordActual&#x60; and an email already claimed by another account return the SAME generic 403 PERFIL_RECHAZADO (anti-enumeration) — 403, never 401: 401 is reserved for an invalid session. Requires x-api-key + a valid session.
     * Responses:
     *  - 200: Profile updated; the full updated identity is returned.
     *  - 400: Malformed body, or an invalid nombre/email.
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *  - 403: Wrong current password, or the email is already in use.
     *
     * @param apiPerfilPatchRequest  (optional)
     * @return [AuthMeResponse]
     */
    @PATCH("api/perfil")
    suspend fun apiPerfilPatch(@Body apiPerfilPatchRequest: ApiPerfilPatchRequest? = null): Response<AuthMeResponse>

    /**
     * GET api/perfil/presupuesto
     * Get the current user&#39;s budget profile
     * Authenticated endpoint that returns the caller&#39;s budget profile (issue #110, PER-03..PER-06): its id and three targets in basis points that sum 10000. A user who never chose a profile gets 50_30_20. Requires x-api-key + a valid session.
     * Responses:
     *  - 200: The caller's budget profile.
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *
     * @return [PerfilPresupuestoResponse]
     */
    @GET("api/perfil/presupuesto")
    suspend fun apiPerfilPresupuestoGet(): Response<PerfilPresupuestoResponse>

    /**
     * PUT api/perfil/presupuesto
     * Replace the current user&#39;s budget profile
     * Authenticated endpoint that replaces the caller&#39;s budget profile (issue #110, PER-03..PER-06). Send a predefined id (50_30_20, 60_20_20, 70_15_15, or 80_10_10, shown as «Salir de deudas»), or &#x60;personalizado&#x60; with three non-negative targets in basis points. Custom targets that do not sum 10000 return 400 PERFIL_NO_SUMA_100 and a negative target returns 400 META_INVALIDA; in both cases the stored profile does not change. &#x60;GET /api/resumen&#x60;, &#x60;GET /api/resumen/anual&#x60;, &#x60;GET /api/resumen/semaforo&#x60; and &#x60;GET /api/buckets/{bucket}/detalle&#x60; measure every month against the current profile. Requires x-api-key + a valid session.
     * Responses:
     *  - 200: Profile saved; the stored profile is returned.
     *  - 400: Malformed body (BODY_INVALIDO), custom targets that do not sum 10000 (PERFIL_NO_SUMA_100), or a negative target (META_INVALIDA).
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *
     * @param perfilPresupuestoUpdateRequest  (optional)
     * @return [PerfilPresupuestoResponse]
     */
    @PUT("api/perfil/presupuesto")
    suspend fun apiPerfilPresupuestoPut(@Body perfilPresupuestoUpdateRequest: PerfilPresupuestoUpdateRequest? = null): Response<PerfilPresupuestoResponse>

    /**
     * GET api/periodos
     * Months that have movements for the session user
     * Feeds the month selector of Resumen, Detalle de bucket and Ingresos del mes. Lists every month (YYYY-MM, UTC) in which the session user has at least one movement: any transaction counts, expense or income-only, whatever its category (internal categories included) — the same rule as the default period of GET /api/resumen, with the same UTC month derivation, so a listed month always has data there. Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation). Ordering: &#x60;periodos&#x60; most recent first, no duplicates; empty list when the user has no movements.
     * Responses:
     *  - 200: Months with data, most recent first.
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *
     * @return [PeriodosResponse]
     */
    @GET("api/periodos")
    suspend fun apiPeriodosGet(): Response<PeriodosResponse>

    /**
     * GET api/resumen/anual
     * Annual 50/30/20 breakdown
     * Authenticated endpoint returning the 50/30/20 budget breakdown for all 12 months of a year (US-030). Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation). Ordering: &#x60;meses&#x60; always holds exactly 12 entries, January to December (ascending &#x60;periodo&#x60;).
     * Responses:
     *  - 200: Annual resumen for the resolved year.
     *  - 400: Invalid anio — either a transport-shape mismatch or a malformed/out-of-range value (domain-level).
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *
     * @param anio Year, e.g. 2026. Absent defaults to the current year. Range/format is validated by the domain, not this schema. (optional)
     * @return [ResumenAnualResponse]
     */
    @GET("api/resumen/anual")
    suspend fun apiResumenAnualGet(@Query("anio") anio: kotlin.String? = null): Response<ResumenAnualResponse>

    /**
     * GET api/resumen
     * Monthly 50/30/20 breakdown
     * Authenticated endpoint returning the 50/30/20 budget breakdown for a month (US-015/016). Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation).
     * Responses:
     *  - 200: Monthly resumen for the resolved period.
     *  - 400: Invalid periodo — either a transport-shape mismatch or a malformed YYYY-MM value (domain-level, PeriodoMes VO).
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *
     * @param periodo Month period, format YYYY-MM (e.g. 2026-07). Absent defaults to the latest month with at least one transaction for this user, falling back to the current month when the user has none (issue #747). Format is validated by the domain, not this schema. (optional)
     * @return [ResumenMesResponse]
     */
    @GET("api/resumen")
    suspend fun apiResumenGet(@Query("periodo") periodo: kotlin.String? = null): Response<ResumenMesResponse>

    /**
     * GET api/resumen/semaforo
     * Semáforo detail: zone-band edges, diagnosis, and CLP-to-Verde advice
     * Authenticated sibling detail endpoint to GET /api/resumen (US-049): exposes the semáforo classification&#39;s WHY and WHAT-TO-DO — per-bucket zone-band edges, a backend-generated Spanish diagnosis naming the driving bucket(s), and a CLP amount+direction that would return each Amarillo/Rojo bucket to Verde. Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation, ISO-01/ISO-02).
     * Responses:
     *  - 200: Semáforo detail for the resolved period.
     *  - 400: Invalid periodo — either a transport-shape mismatch or a malformed YYYY-MM value (domain-level, PeriodoMes VO).
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *
     * @param periodo Month period, format YYYY-MM (e.g. 2026-07). Absent defaults to the latest month with at least one transaction for this user, falling back to the current month when the user has none (issue #747). Format is validated by the domain, not this schema. (optional)
     * @return [SemaforoDetalleResponse]
     */
    @GET("api/resumen/semaforo")
    suspend fun apiResumenSemaforoGet(@Query("periodo") periodo: kotlin.String? = null): Response<SemaforoDetalleResponse>

    /**
     * PATCH api/transacciones/{id}/categoria
     * Reclassify a transaction
     * Authenticated endpoint that manually reassigns a transaction to a category (and its derived bucket) (US-013 S4). Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation).
     * Responses:
     *  - 200: Transaction reclassified.
     *  - 400: Invalid categoriaId — the given id does not resolve against the caller's own catalog, or belongs to another user (scrubbed, CategoriaDesconocidaError; ADR-037 — the closed enum gate is retired; ADR-042 — the contract identifies the categoria by id, not name).
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *  - 404: Anti-enumeration: the transaction does not exist or does not belong to the authenticated user.
     *
     * @param id Transaction id (raw path param). Existence/ownership is checked by the use case, not this schema.
     * @param apiTransaccionesIdCategoriaPatchRequest  (optional)
     * @return [TransaccionesCategoriaResponse]
     */
    @PATCH("api/transacciones/{id}/categoria")
    suspend fun apiTransaccionesIdCategoriaPatch(@Path("id") id: kotlin.String, @Body apiTransaccionesIdCategoriaPatchRequest: ApiTransaccionesIdCategoriaPatchRequest? = null): Response<TransaccionesCategoriaResponse>

    /**
     * POST api/transacciones/reevaluar
     * Re-run the caller&#39;s classification patterns over all transactions
     * Authenticated endpoint that re-runs CategorizarTransaccionUseCase with the caller&#39;s CURRENT pattern catalog against ALL of their persisted transactions — categorized or not, no period filter. A determined classification (a matched pattern, or the Ingreso rule) overwrites the existing categoria/bucket. A row where no pattern matched is left exactly as it is — never cleared. Rows whose determined classification already matches their current value are not re-written (transaccionesActualizadas counts real changes only). Requires x-api-key + a valid session (RNF-SEC-006, per-user isolation).
     * Responses:
     *  - 200: Reevaluation completed.
     *  - 401: No valid API key (`code` API_KEY_INVALIDA) or no valid session — missing, unknown or expired token (`code` SESION_INVALIDA).
     *  - 500: Infrastructure fault — the caller's pattern catalog could not be loaded, or the batched write of reassignments failed (CategorizacionFallidaError). Retryable.
     *
     * @return [ReevaluarCategoriasResponse]
     */
    @POST("api/transacciones/reevaluar")
    suspend fun apiTransaccionesReevaluarPost(): Response<ReevaluarCategoriasResponse>

    /**
     * GET version
     * Deployed build info
     * Public, unauthenticated endpoint exposing the currently deployed build (ADR-030).
     * Responses:
     *  - 200: Build info for the currently deployed API instance.
     *
     * @return [VersionResponse]
     */
    @GET("version")
    suspend fun versionGet(): Response<VersionResponse>

}
