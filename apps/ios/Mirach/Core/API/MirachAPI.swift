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
    /// `nombre` only exists on the first authorization of the Apple ID.
    func signInWithApple(identityToken: String, nonce: String, nombre: String?) async throws -> Session
    /// `GET /api/auth/me`: validates the saved session.
    func currentUser() async throws -> CurrentUser
    /// `GET /api/resumen`. `nil` lets the API resolve the latest month with movements.
    func resumen(periodo: Periodo?) async throws -> ResumenMes
    /// `GET /api/periodos`: months with movements, most recent first.
    func periodos() async throws -> [Periodo]
    /// `POST /api/ingestas/preview`: reads the statement and saves nothing. `password` only
    /// for a protected PDF. Throws `IngestaError` for the answers the catalog names.
    func previewIngesta(file: CartolaFile, password: String?) async throws -> CartolaPreview
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

    func signInWithApple(identityToken: String, nonce: String, nombre: String?) async throws -> Session {
        do {
            let body = Operations.post_sol_api_sol_auth_sol_apple_sol_token.Input.Body.jsonPayload(
                identityToken: identityToken, nombre: nombre, nonce: nonce
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
                return CurrentUser(userId: me.userId, nombre: me.nombre)
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
