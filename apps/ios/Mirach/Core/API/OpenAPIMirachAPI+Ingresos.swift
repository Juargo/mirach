import Foundation
import OpenAPIRuntime

extension OpenAPIMirachAPI {
    func ingresosMes(periodo: Periodo) async throws -> IngresosMes {
        let sentToken = currentToken()
        do {
            switch try await client.get_sol_api_sol_ingresos_sol_mes(query: .init(periodo: periodo.apiValue)) {
            case .ok(let ok):
                return try IngresosMapper.map(try ok.body.json, periodo: periodo)
            case .badRequest:
                // The app only sends periods it built itself: a bug, not a user error.
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
