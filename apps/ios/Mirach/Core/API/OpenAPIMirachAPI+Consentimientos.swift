import Foundation
import OpenAPIRuntime

/// The statement-processing consent (PRI-02) the upload endpoints require, and its revocation (PRI-06).
extension OpenAPIMirachAPI {
    func consentimientos() async throws -> Consentimientos {
        let sentToken = currentToken()
        do {
            switch try await client.get_sol_api_sol_consentimientos() {
            case .ok(let ok):
                let list = try ok.body.json.consentimientos
                return Consentimientos(cartolasVigente: list.contains { $0.tipo == .cartolas && $0.revocadoEn == nil })
            case .unauthorized(let unauthorized):
                throw rejection(code: try unauthorized.body.json.code, sentToken: sentToken)
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw error.underlyingError
        }
    }

    func aceptarConsentimientoCartolas() async throws {
        let sentToken = currentToken()
        do {
            let body = Operations.post_sol_api_sol_consentimientos.Input.Body.jsonPayload(
                tipo: .cartolas, version: LegalDocuments.version
            )
            switch try await client.post_sol_api_sol_consentimientos(body: .json(body)) {
            case .created:
                return
            case .badRequest:
                // The app only sends a fixed type and version: a 400 is a bug, not a user error.
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

    func revocarConsentimientoCartolas() async throws {
        let sentToken = currentToken()
        do {
            switch try await client.delete_sol_api_sol_consentimientos_sol__lcub_tipo_rcub_(path: .init(tipo: .cartolas)) {
            case .noContent:
                return
            case .badRequest:
                // The app only sends a fixed type: a 400 is a bug, not a user error.
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
}
