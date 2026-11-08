import Foundation
import OpenAPIRuntime

extension OpenAPIMirachAPI {
    func bucketDetalle(bucket: Bucket, periodo: Periodo) async throws -> BucketDetalle {
        let sentToken = currentToken()
        do {
            let input = Operations.get_sol_api_sol_buckets_sol__lcub_bucket_rcub__sol_detalle.Input(
                path: .init(bucket: bucket.apiName), query: .init(periodo: periodo.apiValue)
            )
            switch try await client.get_sol_api_sol_buckets_sol__lcub_bucket_rcub__sol_detalle(input) {
            case .ok(let ok):
                return try BucketDetalleMapper.map(try ok.body.json)
            case .badRequest:
                // The app only sends buckets and periods it built itself: a bug, not a user error.
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

    func reclasificar(transaccionId: String, categoriaId: String) async throws -> Reclasificacion {
        try await reclasificar(transaccionId: transaccionId, categoriaId: categoriaId, aplicarAParecidos: nil)
    }

    func reclasificar(
        transaccionId: String, categoriaId: String, aplicarAParecidos: Periodo?
    ) async throws -> Reclasificacion {
        let sentToken = currentToken()
        do {
            let body = Operations.patch_sol_api_sol_transacciones_sol__lcub_id_rcub__sol_categoria.Input.Body.jsonPayload(
                aplicarAParecidos: aplicarAParecidos.map { .init(periodo: $0.apiValue) }, categoriaId: categoriaId
            )
            let input = Operations.patch_sol_api_sol_transacciones_sol__lcub_id_rcub__sol_categoria.Input(
                path: .init(id: transaccionId), body: .json(body)
            )
            switch try await client.patch_sol_api_sol_transacciones_sol__lcub_id_rcub__sol_categoria(input) {
            case .ok(let ok):
                let wire = try ok.body.json
                guard let bucket = Bucket(apiName: wire.bucket) else {
                    throw IngestaMapper.malformed("bucket \(wire.bucket)")
                }
                return Reclasificacion(
                    categoriaId: wire.categoria.id, categoriaNombre: wire.categoria.nombre, bucket: bucket,
                    movidos: wire.movidos
                )
            case .badRequest:
                // The 400 has no documented body: with `aplicarAParecidos` it can also be a
                // malformed body or `PATRON_INVALIDO`, which the app never provokes (it only
                // applies a suggestion the API itself made).
                throw ReclasificarError.categoryNotFound
            case .notFound:
                throw ReclasificarError.movementNotFound
            // 403/503 only come with `aplicarAParecidos` (CLA-03); the app never applies to an
            // internal category because `parecidos` offers nothing there.
            case .forbidden:
                throw APIError.badStatus(403)
            case .serviceUnavailable:
                throw APIError.badStatus(503)
            case .unauthorized(let unauthorized):
                throw rejection(code: try unauthorized.body.json.code, sentToken: sentToken)
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw error.underlyingError
        }
    }

    func parecidos(transaccionId: String, categoriaId: String, periodo: Periodo) async throws -> Parecidos {
        let sentToken = currentToken()
        do {
            let input = Operations.get_sol_api_sol_transacciones_sol__lcub_id_rcub__sol_parecidos.Input(
                path: .init(id: transaccionId), query: .init(categoriaId: categoriaId, periodo: periodo.apiValue)
            )
            switch try await client.get_sol_api_sol_transacciones_sol__lcub_id_rcub__sol_parecidos(input) {
            case .ok(let ok):
                let wire = try ok.body.json
                return Parecidos(
                    patron: wire.patron, total: wire.total,
                    existente: try wire.existente.map { try Self.existente($0.value1) }
                )
            case .badRequest:
                throw APIError.badStatus(400)
            case .notFound(let missing):
                if try missing.body.json.code == "TRANSACCION_NO_ENCONTRADA" { throw ReclasificarError.movementNotFound }
                throw ReclasificarError.categoryNotFound
            case .serviceUnavailable:
                throw APIError.badStatus(503)
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
