import Foundation
import OpenAPIRuntime

extension OpenAPIMirachAPI {
    private typealias Body = Operations.post_sol_api_sol_categorias.Input.Body.jsonPayload

    func crearCategoria(_ new: NuevaCategoria) async throws -> CategoriaCatalogo {
        let sentToken = currentToken()
        // The simplest match type; the screen never sends an icon or a priority.
        let pattern = new.patron?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let body = Body(
            bucket: new.bucket.apiName,
            nombre: new.nombre,
            patrones: pattern.isEmpty ? nil : [.init(matchType: "CONTAINS", patron: pattern)]
        )
        do {
            switch try await client.post_sol_api_sol_categorias(body: .json(body)) {
            case .created(let created):
                let category = try created.body.json
                guard let bucket = Bucket(apiName: category.bucket) else {
                    throw IngestaMapper.malformed("bucket \(category.bucket)")
                }
                return CategoriaCatalogo(id: category.id, nombre: category.nombre, bucket: bucket)
            case .badRequest(let bad):
                let payload = try bad.body.json
                throw Self.categoriaError(code: payload.code, index: payload.indice.map(Int.init), message: payload.message)
            case .conflict(let conflict):
                let payload = try conflict.body.json
                throw Self.categoriaError(code: payload.code, index: payload.indice.map(Int.init), message: payload.message)
            case .unauthorized(let unauthorized):
                throw rejection(code: try unauthorized.body.json.code, sentToken: sentToken)
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw error.underlyingError
        }
    }

    /// One case per `code` the catalog names; anything else keeps the server's message.
    private static func categoriaError(code: String, index: Int?, message: String) -> CategoriaError {
        switch code {
        case "NOMBRE_INVALIDO": .invalidName
        case "BUCKET_NO_ASIGNABLE": .bucketNotAssignable
        case "ICONO_INVALIDO": .invalidIcon
        case "PATRON_INVALIDO": .invalidPattern(index: index)
        case "MATCH_TYPE_INVALIDO": .invalidMatchType(index: index)
        case "REGEX_INVALIDA": .invalidRegex(index: index)
        case "NOMBRE_DUPLICADO": .duplicateName
        case "PATRON_DUPLICADO": .duplicatePattern(index: index)
        default: .rejected(message: message)
        }
    }
}
