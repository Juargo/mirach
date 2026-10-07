import Foundation
import HTTPTypes
import OpenAPIRuntime

/// Upload endpoints of the adapter. Both send the statement as `multipart/form-data`.
extension OpenAPIMirachAPI {
    private typealias PreviewParts = Operations.post_sol_api_sol_ingestas_sol_preview.Input.Body.multipartFormPayload
    private typealias CommitParts = Operations.post_sol_api_sol_ingestas_sol_commit.Input.Body.multipartFormPayload

    func previewIngesta(file: CartolaFile, password: String?) async throws -> CartolaPreview {
        let sentToken = currentToken()
        let data = try Self.read(file)
        var parts: [PreviewParts] = [
            .file(.init(payload: .init(body: HTTPBody(data)), filename: file.filename))
        ]
        // Absent or empty means "no protection": only send it when there is one.
        if let password, !password.isEmpty {
            parts.append(.password(.init(payload: .init(body: HTTPBody(password)))))
        }
        do {
            switch try await client.post_sol_api_sol_ingestas_sol_preview(body: .multipartForm(.init(parts))) {
            case .ok(let ok):
                return try Self.map(try ok.body.json)
            case .badRequest(let bad):
                throw Self.rejection(of: bad.body)
            case .unauthorized(let unauthorized):
                throw rejection(code: try unauthorized.body.json.code, sentToken: sentToken)
            case .conflict:
                throw IngestaError.catalogIncomplete
            case .internalServerError:
                throw IngestaError.serverFailure
            case .serviceUnavailable:
                throw IngestaError.catalogUnavailable
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw await unwrap(error, sentToken: sentToken)
        }
    }

    func commitIngesta(file: CartolaFile, password: String?, edits: [CartolaEdit]) async throws -> CartolaCommitResult {
        let sentToken = currentToken()
        let data = try Self.read(file)
        var parts: [CommitParts] = [
            .file(.init(payload: .init(body: HTTPBody(data)), filename: file.filename)),
            .edits(.init(payload: .init(body: HTTPBody(try Self.editsJSON(edits))))),
        ]
        if let password, !password.isEmpty {
            parts.append(.password(.init(payload: .init(body: HTTPBody(password)))))
        }
        do {
            switch try await client.post_sol_api_sol_ingestas_sol_commit(body: .multipartForm(.init(parts))) {
            case .created(let created):
                let result = try created.body.json
                return CartolaCommitResult(
                    totalTransacciones: result.totalTransacciones, duplicadosOmitidos: result.duplicadosOmitidos
                )
            case .badRequest(let bad):
                throw Self.rejection(of: bad.body)
            case .unauthorized(let unauthorized):
                throw rejection(code: try unauthorized.body.json.code, sentToken: sentToken)
            case .conflict:
                throw IngestaError.catalogIncomplete
            case .internalServerError:
                throw IngestaError.serverFailure
            case .serviceUnavailable:
                throw IngestaError.catalogUnavailable
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw await unwrap(error, sentToken: sentToken)
        }
    }

    // MARK: mapping

    /// The generated client fails with `ClientError` when it cannot decode an answer (for
    /// instance a 400 whose `code` the app has never seen). The status and the raw body are
    /// still there, so the answer keeps its meaning instead of becoming a generic failure.
    private func unwrap(_ error: ClientError, sentToken: String?) async -> any Error {
        let json = await Self.rawJSON(of: error)
        switch error.response?.status.code {
        case 400:
            return Self.map400(code: nil, message: (json?["message"] as? String) ?? "")
        case 401:
            // Any 401 goes through the single session-expiry relay, readable or not; only a
            // body that says the client key is wrong is not a session problem.
            if (json?["code"] as? String) == "API_KEY_INVALIDA" { return APIError.apiKeyRejected }
            if let sentToken { onSessionExpired(sentToken) }
            return APIError.sessionExpired
        case 409: return IngestaError.catalogIncomplete
        case 500: return IngestaError.serverFailure
        case 503: return IngestaError.catalogUnavailable
        default: return error.underlyingError
        }
    }

    private static func rawJSON(of error: ClientError) async -> [String: Any]? {
        guard let body = error.responseBody, let data = try? await Data(collecting: body, upTo: 65_536) else {
            return nil
        }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }

    /// The staged copy is ours alone: if it cannot be read it is gone, and only choosing the
    /// file again helps (so this must not look like a retryable server error).
    private static func read(_ file: CartolaFile) throws -> Data {
        do {
            return try Data(contentsOf: file.url)
        } catch {
            throw IngestaError.fileUnreadable
        }
    }

    /// Used when a 400 arrives whose body cannot be read at all.
    private static let genericRejection = "No pudimos leer la cartola. Revisa que sea una cartola válida."

    /// 400 on either endpoint. A body the generated types cannot decode (for instance a `code`
    /// the app has never seen) must not hide the problem: fall back to a generic message.
    private static func rejection(
        of body: Operations.post_sol_api_sol_ingestas_sol_preview.Output.BadRequest.Body
    ) -> IngestaError {
        guard let payload = try? body.json else { return .rejected(message: genericRejection) }
        return map400(code: payload.code?.rawValue, message: payload.message)
    }

    private static func rejection(
        of body: Operations.post_sol_api_sol_ingestas_sol_commit.Output.BadRequest.Body
    ) -> IngestaError {
        guard let payload = try? body.json else { return .rejected(message: genericRejection) }
        return map400(code: payload.code?.rawValue, message: payload.message)
    }

    private static func map400(code: String?, message: String) -> IngestaError {
        switch code {
        case "PDF_PROTEGIDO": .passwordRequired
        case "PDF_PASSWORD_INCORRECTA": .passwordIncorrect
        case "SIN_MOVIMIENTOS": .noMovements
        default: .rejected(message: message.isEmpty ? genericRejection : message)
        }
    }

    private static func map(_ wire: Components.Schemas.PreviewIngestaResponse) throws -> CartolaPreview {
        // `resumen` is optional in the contract, but without it there is nothing to decide on.
        guard let resumen = wire.resumen else {
            throw DecodingError.keyNotFound(
                CodingKeys.resumen, .init(codingPath: [], debugDescription: "preview without resumen")
            )
        }
        return CartolaPreview(
            banco: wire.banco, tipoCuenta: wire.tipoCuenta, numeroCuenta: wire.numeroCuenta,
            totalFilas: resumen.totalFilas, duplicados: resumen.duplicadosDetectados, nuevas: resumen.nuevas
        )
    }

    private enum CodingKeys: String, CodingKey { case resumen }

    /// `[{"rowIndex":3,"categoriaId":"..."}]`, only the rows the person touched.
    private static func editsJSON(_ edits: [CartolaEdit]) throws -> String {
        struct Wire: Encodable {
            let rowIndex: Int
            let categoriaId: String
        }
        let data = try JSONEncoder().encode(edits.map { Wire(rowIndex: $0.rowIndex, categoriaId: $0.categoriaId) })
        return String(decoding: data, as: UTF8.self)
    }
}
