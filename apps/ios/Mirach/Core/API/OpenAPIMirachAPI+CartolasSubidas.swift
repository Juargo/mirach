import Foundation
import OpenAPIRuntime

extension OpenAPIMirachAPI {
    func cartolasSubidas() async throws -> [CartolaSubida] {
        let sentToken = currentToken()
        do {
            switch try await client.get_sol_api_sol_ingestas() {
            case .ok(let ok):
                return try CartolasSubidasMapper.map(try ok.body.json)
            case .unauthorized(let unauthorized):
                throw rejection(code: try unauthorized.body.json.code, sentToken: sentToken)
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw error.underlyingError
        }
    }

    func eliminarCartola(id: String) async throws {
        let sentToken = currentToken()
        do {
            switch try await client.delete_sol_api_sol_ingestas_sol__lcub_id_rcub_(path: .init(id: id)) {
            case .noContent:
                return
            case .unauthorized(let unauthorized):
                throw rejection(code: try unauthorized.body.json.code, sentToken: sentToken)
            case .notFound:
                throw EliminarCartolaError.notFound
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw error.underlyingError
        }
    }
}
