import Foundation
import OpenAPIRuntime

extension OpenAPIMirachAPI {
    func perfilPresupuesto() async throws -> PerfilPresupuesto {
        let sentToken = currentToken()
        do {
            switch try await client.get_sol_api_sol_perfil_sol_presupuesto(.init()) {
            case .ok(let ok):
                return Self.map(try ok.body.json.perfil)
            case .unauthorized(let unauthorized):
                throw rejection(code: try unauthorized.body.json.code, sentToken: sentToken)
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw error.underlyingError
        }
    }

    func guardarPerfilPresupuesto(_ perfil: PerfilPredefinido) async throws -> PerfilPresupuesto {
        let sentToken = currentToken()
        // Only `perfil` goes: `diaCorte` and `ingresoDeclarado` stay as the server has them.
        let body = Components.Schemas.PerfilPresupuestoUpdateRequest(
            value1: .init(perfil: Self.payload(perfil))
        )
        do {
            switch try await client.put_sol_api_sol_perfil_sol_presupuesto(.init(body: .json(body))) {
            case .ok(let ok):
                return Self.map(try ok.body.json.perfil)
            case .badRequest:
                // The app only sends ids it built itself: a bug, not a user error.
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

    private static func map(_ perfil: Components.Schemas.PerfilPresupuestoResponse.perfilPayload) -> PerfilPresupuesto {
        switch perfil {
        case ._50_30_20: .predefinido(.p50_30_20)
        case ._60_20_20: .predefinido(.p60_20_20)
        case ._70_15_15: .predefinido(.p70_15_15)
        case ._80_10_10: .predefinido(.p80_10_10)
        case .personalizado: .personalizado
        }
    }

    private static func payload(
        _ perfil: PerfilPredefinido
    ) -> Components.Schemas.PerfilPresupuestoPredefinido.perfilPayload {
        switch perfil {
        case .p50_30_20: ._50_30_20
        case .p60_20_20: ._60_20_20
        case .p70_15_15: ._70_15_15
        case .p80_10_10: ._80_10_10
        }
    }
}
