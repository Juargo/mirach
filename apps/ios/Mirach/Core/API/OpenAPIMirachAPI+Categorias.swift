import Foundation
import OpenAPIRuntime

extension OpenAPIMirachAPI {
    private typealias Body = Operations.post_sol_api_sol_categorias.Input.Body.jsonPayload

    func crearCategoria(_ new: NuevaCategoria) async throws -> CategoriaCatalogo {
        let sentToken = currentToken()
        // The simplest match type; the screen never sends a priority.
        let pattern = new.patron?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let body = Body(
            bucket: new.bucket.apiName,
            icono: new.icono,
            nombre: new.nombre,
            patrones: pattern.isEmpty ? nil : [.init(matchType: "CONTAINS", patron: pattern)]
        )
        do {
            switch try await client.post_sol_api_sol_categorias(body: .json(body)) {
            case .created(let created):
                return try Self.mapped(try created.body.json)
            case .badRequest(let bad):
                throw Self.categoriaError(from: try bad.body.json)
            case .conflict(let conflict):
                throw Self.categoriaError(from: try conflict.body.json)
            case .unauthorized(let unauthorized):
                throw rejection(code: try unauthorized.body.json.code, sentToken: sentToken)
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw error.underlyingError
        }
    }

    /// `PATCH /api/categorias/{id}` with only the fields that changed.
    func actualizarCategoria(id: String, cambios: CategoriaCambios) async throws -> CategoriaCatalogo {
        let sentToken = currentToken()
        let body = Operations.patch_sol_api_sol_categorias_sol__lcub_id_rcub_.Input.Body.jsonPayload(
            bucket: cambios.bucket?.apiName, icono: cambios.icono, nombre: cambios.nombre
        )
        do {
            switch try await client.patch_sol_api_sol_categorias_sol__lcub_id_rcub_(path: .init(id: id), body: .json(body)) {
            case .ok(let ok):
                return try Self.mapped(try ok.body.json)
            case .badRequest(let bad):
                throw Self.categoriaError(from: try bad.body.json)
            case .conflict(let conflict):
                throw Self.categoriaError(from: try conflict.body.json)
            case .notFound:
                // Like the deletion: whatever its code, the category is not there.
                throw CategoriaError.notFound
            case .forbidden:
                throw CategoriaError.isInternal
            case .unauthorized(let unauthorized):
                throw rejection(code: try unauthorized.body.json.code, sentToken: sentToken)
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw error.underlyingError
        }
    }

    func eliminarCategoria(id: String) async throws {
        let sentToken = currentToken()
        do {
            switch try await client.delete_sol_api_sol_categorias_sol__lcub_id_rcub_(path: .init(id: id)) {
            case .noContent:
                return
            case .notFound:
                throw CategoriaError.notFound
            case .forbidden:
                throw CategoriaError.isInternal
            case .unauthorized(let unauthorized):
                throw rejection(code: try unauthorized.body.json.code, sentToken: sentToken)
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw error.underlyingError
        }
    }

    func crearPatron(categoriaId: String, patron: String, matchType: MatchType) async throws -> PatronCategoria {
        let sentToken = currentToken()
        let body = Operations.post_sol_api_sol_patrones.Input.Body.jsonPayload(
            categoriaId: categoriaId, matchType: matchType.apiName, patron: patron
        )
        do {
            switch try await client.post_sol_api_sol_patrones(body: .json(body)) {
            case .created(let created):
                return Self.mapped(try created.body.json)
            case .badRequest(let bad):
                throw Self.patronError(from: try bad.body.json)
            case .notFound(let missing):
                throw Self.patronError(from: try missing.body.json)
            case .conflict(let conflict):
                throw Self.patronError(from: try conflict.body.json)
            case .unauthorized(let unauthorized):
                throw rejection(code: try unauthorized.body.json.code, sentToken: sentToken)
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw error.underlyingError
        }
    }

    /// `PATCH /api/patrones/{id}` with only the fields that changed.
    func actualizarPatron(id: String, cambios: PatronCambios) async throws -> PatronCategoria {
        let sentToken = currentToken()
        let body = Operations.patch_sol_api_sol_patrones_sol__lcub_id_rcub_.Input.Body.jsonPayload(
            matchType: cambios.matchType?.apiName, patron: cambios.patron
        )
        do {
            switch try await client.patch_sol_api_sol_patrones_sol__lcub_id_rcub_(path: .init(id: id), body: .json(body)) {
            case .ok(let ok):
                return Self.mapped(try ok.body.json)
            case .badRequest(let bad):
                throw Self.patronError(from: try bad.body.json)
            case .notFound(let missing):
                throw Self.patronError(from: try missing.body.json)
            case .conflict(let conflict):
                throw Self.patronError(from: try conflict.body.json)
            case .unauthorized(let unauthorized):
                throw rejection(code: try unauthorized.body.json.code, sentToken: sentToken)
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw error.underlyingError
        }
    }

    func eliminarPatron(id: String) async throws {
        let sentToken = currentToken()
        do {
            switch try await client.delete_sol_api_sol_patrones_sol__lcub_id_rcub_(path: .init(id: id)) {
            case .noContent:
                return
            case .notFound:
                throw PatronError.patternNotFound
            case .unauthorized(let unauthorized):
                throw rejection(code: try unauthorized.body.json.code, sentToken: sentToken)
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            throw error.underlyingError
        }
    }

    // MARK: mapping

    private static func mapped(_ wire: Components.Schemas.CategoriaResponse) throws -> CategoriaCatalogo {
        guard let category = IngestaMapper.category(wire) else {
            throw IngestaMapper.malformed("bucket \(wire.bucket)")
        }
        return category
    }

    private static func mapped(_ wire: Components.Schemas.PatronResponse) -> PatronCategoria {
        PatronCategoria(id: wire.id, patron: wire.patron, matchType: MatchType(apiName: wire.matchType))
    }

    private static func categoriaError(from wire: Components.Schemas.CatalogoErrorResponse) -> CategoriaError {
        categoriaError(code: wire.code, index: wire.indice.map(Int.init), message: wire.message)
    }

    /// One case per `code` the catalog names; anything else keeps the server's message.
    static func categoriaError(code: String, index: Int?, message: String) -> CategoriaError {
        switch code {
        case "NOMBRE_INVALIDO": .invalidName
        case "BUCKET_NO_ASIGNABLE": .bucketNotAssignable
        case "ICONO_INVALIDO": .invalidIcon
        case "PATRON_INVALIDO": .invalidPattern(index: index)
        case "MATCH_TYPE_INVALIDO": .invalidMatchType(index: index)
        case "REGEX_INVALIDA": .invalidRegex(index: index)
        case "NOMBRE_DUPLICADO": .duplicateName
        case "PATRON_DUPLICADO": .duplicatePattern(index: index)
        case "CATEGORIA_NO_ENCONTRADA": .notFound
        default: .rejected(message: message)
        }
    }

    private static func patronError(from wire: Components.Schemas.CatalogoErrorResponse) -> PatronError {
        switch wire.code {
        case "PATRON_INVALIDO": .invalidPattern
        case "MATCH_TYPE_INVALIDO": .invalidMatchType
        case "REGEX_INVALIDA": .invalidRegex
        case "PRIORIDAD_INVALIDA": .invalidPriority
        case "PATRON_DUPLICADO": .duplicate
        case "CATEGORIA_NO_ENCONTRADA": .categoryNotFound
        case "PATRON_NO_ENCONTRADO": .patternNotFound
        default: .rejected(message: wire.message)
        }
    }
}
