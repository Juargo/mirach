import Foundation
import HTTPTypes
import OpenAPIRuntime

/// What screens need from the API. Screens depend on this protocol, never on
/// the generated types, so a spec change is absorbed here and tests can use a fake.
protocol MirachAPI: Sendable {
    /// Public `GET /version`: the deployed build of the API.
    func version() async throws -> VersionInfo
    /// `GET /api/auth/capabilities`: which providers can be offered. Needs only the API key.
    func authCapabilities() async throws -> AuthCapabilities
    /// `POST /api/auth/apple/token`. `nonce` is the RAW value; Apple was given its SHA-256.
    /// `nombre` only exists on the first authorization of the Apple ID. `authorizationCode` is the
    /// one-time code (5 minutes) the server trades for a revocable refresh token; optional, and
    /// sign-in works without it. Never log it.
    func signInWithApple(
        identityToken: String, nonce: String, nombre: String?, authorizationCode: String?
    ) async throws -> Session
    /// `GET /api/auth/me`: validates the saved session.
    func currentUser() async throws -> CurrentUser
    /// `PATCH /api/perfil` with only the name; answers the updated identity.
    /// Throws `PerfilError.invalidName` for `NOMBRE_INVALIDO`.
    func updateNombre(_ nombre: String) async throws -> CurrentUser
    /// `POST /api/auth/logout`: revokes the session on the server. Throws on any failure; the
    /// caller signs out locally either way.
    func logout() async throws
    /// `DELETE /api/cuenta` with `{"confirmacion": confirmation}`. Throws `CuentaError` for the
    /// 400 the catalog names.
    func deleteAccount(confirmation: String) async throws
    /// `GET /api/resumen`. `nil` lets the API resolve the latest month with movements.
    func resumen(periodo: Periodo?) async throws -> ResumenMes
    /// `GET /api/periodos`: months with movements, most recent first.
    func periodos() async throws -> [Periodo]
    /// `POST /api/ingestas/preview`: reads the statement and saves nothing. `password` only
    /// for a protected PDF. Throws `IngestaError` for the answers the catalog names.
    func previewIngesta(file: CartolaFile, password: String?) async throws -> CartolaPreview
    /// `GET /api/categorias`: the user's categories, for naming a row's classification and for
    /// choosing another one in the review.
    func categorias() async throws -> CatalogoCategorias
    /// `POST /api/categorias`: creates a category (with at most one pattern) from the review.
    /// Throws `CategoriaError` for the 400 and 409 the catalog names.
    func crearCategoria(_ new: NuevaCategoria) async throws -> CategoriaCatalogo
    /// `PATCH /api/categorias/{id}` with only the changed fields (`cambios` is never empty).
    /// Throws `CategoriaError` for the 400, 403, 404 and 409 the catalog names.
    func actualizarCategoria(id: String, cambios: CategoriaCambios) async throws -> CategoriaCatalogo
    /// `DELETE /api/categorias/{id}`: its patterns go with it and its movements move to the
    /// «Desconocido» of the same bucket. Throws `CategoriaError.notFound` or `.isInternal`.
    func eliminarCategoria(id: String) async throws
    /// `POST /api/patrones`; the category is identified by id. Throws `PatronError`.
    func crearPatron(categoriaId: String, patron: String, matchType: MatchType) async throws -> PatronCategoria
    /// `PATCH /api/patrones/{id}` with only the changed fields. Throws `PatronError`.
    func actualizarPatron(id: String, cambios: PatronCambios) async throws -> PatronCategoria
    /// `DELETE /api/patrones/{id}`. Throws `PatronError.patternNotFound` for the 404.
    func eliminarPatron(id: String) async throws
    /// `GET /api/buckets/{bucket}/detalle`: the bucket's movements for a month, grouped by category.
    /// `periodo` is always one the app built or got from the API.
    func bucketDetalle(bucket: Bucket, periodo: Periodo) async throws -> BucketDetalle
    /// `PATCH /api/transacciones/{id}/categoria` with `{"categoriaId": ...}`: the category is
    /// identified by its id, never by name (ADR-042). Throws `ReclasificarError` for the 400 and
    /// 404 the catalog names.
    func reclasificar(transaccionId: String, categoriaId: String) async throws -> Reclasificacion
    /// `GET /api/ingresos/mes`: every income of the month, with its total and count. The
    /// response carries no month, so the model gets the `periodo` that was asked for.
    func ingresosMes(periodo: Periodo) async throws -> IngresosMes
    /// `GET /api/ingestas`: the imports, newest first (the order is kept as received).
    func cartolasSubidas() async throws -> [CartolaSubida]
    /// `DELETE /api/ingestas/{id}`: removes the import and its movements. Throws
    /// `EliminarCartolaError.notFound` for the 404.
    func eliminarCartola(id: String) async throws
    /// `POST /api/ingestas/commit`: the API reads the file again (it keeps no preview), so the
    /// same file and password go with it. `edits` holds only the rows the person reclassified.
    func commitIngesta(file: CartolaFile, password: String?, edits: [CartolaEdit]) async throws -> CartolaCommitResult
}

enum APIError: Error, Equatable {
    /// The server answered with a status the spec does not document (e.g. 503).
    case badStatus(Int)
    /// 401 `SESION_INVALIDA` on an authenticated call: the session is gone, sign in again.
    case sessionExpired
    /// 401 `API_KEY_INVALIDA`: the app's client key is missing or wrong. Signing in
    /// again cannot fix it, so it is NOT a session expiry.
    case apiKeyRejected
    /// 401 `CREDENCIALES_INVALIDAS` on a sign-in endpoint (the server never says why).
    case invalidCredentials
    /// 404 on the Apple token endpoint: Sign in with Apple is switched off on the server.
    case appleSignInUnavailable
    /// 429: too many attempts.
    case rateLimited
}

/// `MirachAPI` backed by the generated OpenAPI client.
struct OpenAPIMirachAPI: MirachAPI {
    let client: Client
    let currentToken: @Sendable () -> String?
    let onSessionExpired: @Sendable (String) -> Void

    /// `onSessionExpired` is called with the token that was rejected whenever an authenticated
    /// call gets `SESION_INVALIDA`: the single place that notices an expired session, so no
    /// screen has to remember to handle it (catalog: "sesión vencida"). `currentToken` is read
    /// when the call starts, so a late answer is attributed to the session it was sent with.
    init(
        serverURL: URL,
        transport: any ClientTransport,
        middlewares: [any ClientMiddleware] = [],
        currentToken: @escaping @Sendable () -> String? = { nil },
        onSessionExpired: @escaping @Sendable (String) -> Void = { _ in }
    ) {
        client = Client(serverURL: serverURL, transport: transport, middlewares: middlewares)
        self.currentToken = currentToken
        self.onSessionExpired = onSessionExpired
    }

    func version() async throws -> VersionInfo {
        do {
            let output = try await client.get_sol_version()
            switch output {
            case .ok(let ok):
                let body = try ok.body.json
                return VersionInfo(version: body.version, commit: body.commit)
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            // The generated client wraps everything in ClientError; screens map the real cause.
            throw error.underlyingError
        }
    }

    func authCapabilities() async throws -> AuthCapabilities {
        do {
            switch try await client.get_sol_api_sol_auth_sol_capabilities() {
            case .ok(let ok):
                return AuthCapabilities(appleLoginEnabled: try ok.body.json.appleLoginEnabled)
            case .unauthorized:
                throw APIError.apiKeyRejected
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw error.underlyingError
        }
    }

    func signInWithApple(
        identityToken: String, nonce: String, nombre: String?, authorizationCode: String?
    ) async throws -> Session {
        do {
            let body = Operations.post_sol_api_sol_auth_sol_apple_sol_token.Input.Body.jsonPayload(
                authorizationCode: authorizationCode, identityToken: identityToken, nombre: nombre, nonce: nonce
            )
            switch try await client.post_sol_api_sol_auth_sol_apple_sol_token(body: .json(body)) {
            case .ok(let ok):
                let login = try ok.body.json
                return Session(
                    token: login.token,
                    userId: login.userId,
                    expiresAt: try Self.parseExpiry(login.expiresAt)
                )
            case .unauthorized(let unauthorized):
                // A failed sign-in is never "session expired": there is no session yet.
                switch try unauthorized.body.json.code {
                case .API_KEY_INVALIDA: throw APIError.apiKeyRejected
                case .CREDENCIALES_INVALIDAS: throw APIError.invalidCredentials
                }
            case .notFound:
                throw APIError.appleSignInUnavailable
            case .tooManyRequests:
                throw APIError.rateLimited
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw error.underlyingError
        }
    }

    func currentUser() async throws -> CurrentUser {
        let sentToken = currentToken()
        do {
            switch try await client.get_sol_api_sol_auth_sol_me() {
            case .ok(let ok):
                let me = try ok.body.json
                return CurrentUser(userId: me.userId, nombre: me.nombre, email: me.email)
            case .unauthorized(let unauthorized):
                throw rejection(code: try unauthorized.body.json.code, sentToken: sentToken)
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw error.underlyingError
        }
    }

    func updateNombre(_ nombre: String) async throws -> CurrentUser {
        let sentToken = currentToken()
        do {
            // Only the name: `email` needs the current password and the app never changes it.
            switch try await client.patch_sol_api_sol_perfil(body: .json(.init(nombre: nombre))) {
            case .ok(let ok):
                let me = try ok.body.json
                return CurrentUser(userId: me.userId, nombre: me.nombre, email: me.email)
            case .badRequest(let bad):
                if try bad.body.json.code == "NOMBRE_INVALIDO" { throw PerfilError.invalidName }
                throw APIError.badStatus(400)
            case .unauthorized(let unauthorized):
                throw rejection(code: try unauthorized.body.json.code, sentToken: sentToken)
            case .forbidden:
                // Only an email change is refused with 403, and the app never sends one.
                throw APIError.badStatus(403)
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw error.underlyingError
        }
    }

    func logout() async throws {
        do {
            switch try await client.post_sol_api_sol_auth_sol_logout() {
            case .noContent:
                return
            case .unauthorized:
                // Public endpoint: its only 401 is the client key.
                throw APIError.apiKeyRejected
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw error.underlyingError
        }
    }

    func deleteAccount(confirmation: String) async throws {
        let sentToken = currentToken()
        do {
            switch try await client.delete_sol_api_sol_cuenta(body: .json(.init(confirmacion: confirmation))) {
            case .noContent:
                return
            case .badRequest(let bad):
                if try bad.body.json.code == "CONFIRMACION_INVALIDA" { throw CuentaError.confirmationRejected }
                throw APIError.badStatus(400)
            case .unauthorized(let unauthorized):
                throw rejection(code: try unauthorized.body.json.code, sentToken: sentToken)
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw error.underlyingError
        }
    }

    func resumen(periodo: Periodo?) async throws -> ResumenMes {
        let sentToken = currentToken()
        do {
            switch try await client.get_sol_api_sol_resumen(query: .init(periodo: periodo?.apiValue)) {
            case .ok(let ok):
                return try ResumenMapper.map(try ok.body.json)
            case .badRequest:
                // The app only sends periods it built itself: a 400 is a bug, not a user error.
                throw APIError.badStatus(400)
            case .unauthorized(let unauthorized):
                throw rejection(code: try unauthorized.body.json.code, sentToken: sentToken)
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw error.underlyingError
        }
    }

    func periodos() async throws -> [Periodo] {
        let sentToken = currentToken()
        do {
            switch try await client.get_sol_api_sol_periodos() {
            case .ok(let ok):
                return try ok.body.json.periodos.map { text in
                    guard let periodo = Periodo(text) else { throw ResumenMapper.malformed("periodo \(text)") }
                    return periodo
                }
            case .unauthorized(let unauthorized):
                throw rejection(code: try unauthorized.body.json.code, sentToken: sentToken)
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw error.underlyingError
        }
    }

    /// Every authenticated endpoint funnels its 401 through here, so the expired-session
    /// notification lives in exactly one place.
    func rejection(
        code: Components.Schemas.UnauthorizedResponse.codePayload,
        sentToken: String?
    ) -> APIError {
        switch code {
        case .SESION_INVALIDA:
            if let sentToken { onSessionExpired(sentToken) }
            return .sessionExpired
        case .API_KEY_INVALIDA:
            return .apiKeyRejected
        }
    }

    /// The API sends `expiresAt` as ISO 8601 with milliseconds ("2026-10-04T12:00:00.000Z").
    private static func parseExpiry(_ text: String) throws -> Date {
        let withFraction = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
        if let date = try? withFraction.parse(text) { return date }
        if let date = try? Date.ISO8601FormatStyle().parse(text) { return date }
        throw DecodingError.dataCorrupted(
            .init(codingPath: [], debugDescription: "expiresAt is not an ISO 8601 date")
        )
    }
}
