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
        let sentToken = currentToken()
        do {
            let input = Operations.patch_sol_api_sol_transacciones_sol__lcub_id_rcub__sol_categoria.Input(
                path: .init(id: transaccionId), body: .json(.init(categoriaId: categoriaId))
            )
            switch try await client.patch_sol_api_sol_transacciones_sol__lcub_id_rcub__sol_categoria(input) {
            case .ok(let ok):
                let wire = try ok.body.json
                guard let bucket = Bucket(apiName: wire.bucket) else {
                    throw IngestaMapper.malformed("bucket \(wire.bucket)")
                }
                return Reclasificacion(categoriaId: wire.categoria.id, categoriaNombre: wire.categoria.nombre, bucket: bucket)
            case .badRequest:
                throw ReclasificarError.categoryNotFound
            case .notFound:
                throw ReclasificarError.movementNotFound
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
