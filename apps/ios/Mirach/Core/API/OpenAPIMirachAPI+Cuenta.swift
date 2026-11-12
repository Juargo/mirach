import Foundation
import OpenAPIRuntime

/// The anonymous account (ADR-013): creating it and linking it to Apple or Google.
extension OpenAPIMirachAPI {
    func signInAnonymously() async throws -> Session {
        do {
            let body = Operations.post_sol_api_sol_auth_sol_anonimo.Input.Body.jsonPayload(
                versionPrivacidad: LegalDocuments.version, versionTerminos: LegalDocuments.version
            )
            switch try await client.post_sol_api_sol_auth_sol_anonimo(body: .json(body)) {
            case .ok(let ok):
                return try Self.session(from: try ok.body.json, isAnonymous: true)
            case .unauthorized:
                // Public route: its only 401 is the client key.
                throw APIError.apiKeyRejected
            case .tooManyRequests:
                throw APIError.rateLimited
            case .badRequest:
                throw APIError.badStatus(400)
            case .serviceUnavailable:
                throw APIError.badStatus(503)
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw Self.statusError(from: error, among: [400, 503])
        }
    }

    func linkWithApple(
        identityToken: String, nonce: String, nombre: String?, authorizationCode: String?
    ) async throws -> Session {
        let sentToken = currentToken()
        do {
            let body = Operations.post_sol_api_sol_cuenta_sol_vincular_sol_apple.Input.Body.jsonPayload(
                authorizationCode: authorizationCode, identityToken: identityToken, nombre: nombre, nonce: nonce
            )
            switch try await client.post_sol_api_sol_cuenta_sol_vincular_sol_apple(body: .json(body)) {
            case .ok(let ok):
                return try Self.session(from: try ok.body.json, isAnonymous: false)
            case .badRequest:
                throw APIError.badStatus(400)
            case .unauthorized(let unauthorized):
                throw rejection(code: try unauthorized.body.json.code, sentToken: sentToken)
            case .notFound:
                throw APIError.linkProviderUnavailable
            case .conflict(let conflict):
                throw Self.linkConflict(try conflict.body.json.code)
            case .tooManyRequests:
                throw APIError.rateLimited
            case .serviceUnavailable:
                throw APIError.badStatus(503)
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw Self.statusError(from: error, among: [400, 409, 503])
        }
    }

    func linkWithGoogle(idToken: String) async throws -> Session {
        let sentToken = currentToken()
        do {
            let body = Operations.post_sol_api_sol_cuenta_sol_vincular_sol_google.Input.Body.jsonPayload(
                idToken: idToken
            )
            switch try await client.post_sol_api_sol_cuenta_sol_vincular_sol_google(body: .json(body)) {
            case .ok(let ok):
                return try Self.session(from: try ok.body.json, isAnonymous: false)
            case .badRequest:
                throw APIError.badStatus(400)
            case .unauthorized(let unauthorized):
                throw rejection(code: try unauthorized.body.json.code, sentToken: sentToken)
            case .notFound:
                throw APIError.linkProviderUnavailable
            case .conflict(let conflict):
                throw Self.linkConflict(try conflict.body.json.code)
            case .tooManyRequests:
                throw APIError.rateLimited
            case .serviceUnavailable:
                throw APIError.badStatus(503)
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw Self.statusError(from: error, among: [400, 409, 503])
        }
    }

    private static func session(
        from login: Components.Schemas.AuthLoginResponse, isAnonymous: Bool
    ) throws -> Session {
        Session(
            token: login.token, userId: login.userId,
            expiresAt: try parseExpiry(login.expiresAt), isAnonymous: isAnonymous
        )
    }

    private static func linkConflict(
        _ code: Components.Schemas.VinculacionRechazadaResponse.codePayload
    ) -> APIError {
        switch code {
        case .CUENTA_YA_EXISTE: .accountAlreadyExists
        case .CUENTA_NO_ANONIMA: .accountNotAnonymous
        }
    }

    /// A documented status whose body cannot be decoded (a proxy's own page) must not hide the
    /// status: the app only needs the number.
    private static func statusError(from error: ClientError, among statuses: [Int]) -> any Error {
        if let status = error.response?.status.code, statuses.contains(status) {
            return APIError.badStatus(status)
        }
        return error.underlyingError
    }
}
