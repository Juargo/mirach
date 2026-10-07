import Foundation
import HTTPTypes
import Testing
@testable import Mirach

/// The catalog endpoints behind Categorías and Detalle de categoría, through the real generated
/// client: what each request sends (ids, only the changed fields) and how every answer maps.
struct CategoriasAPITests {
    private let serverURL = URL(string: "https://example.test")!

    private func makeAPI(_ transport: FakeTransport, expired: @escaping @Sendable (String) -> Void = { _ in }) -> OpenAPIMirachAPI {
        OpenAPIMirachAPI(serverURL: serverURL, transport: transport, currentToken: { "tok" }, onSessionExpired: expired)
    }

    private func sentObject(_ transport: FakeTransport) throws -> [String: Any] {
        let body = try #require(transport.bodies.first)
        return try #require(try JSONSerialization.jsonObject(with: Data(body.utf8)) as? [String: Any])
    }

    private static let categoryBody = """
    {"id":"c-1","nombre":"Streaming","bucket":"Deseos","icono":"tv","esInterna":false,"transaccionesCount":12,
     "patrones":[{"id":"p-1","categoriaId":"c-1","patron":"NETFLIX","matchType":"CONTAINS","prioridad":0},
                 {"id":"p-2","categoriaId":"c-1","patron":"^SPOT","matchType":"REGEX","prioridad":1},
                 {"id":"p-3","categoriaId":"c-1","patron":"HBO","matchType":"ENDS_WITH","prioridad":2}]}
    """

    // MARK: reading

    @Test func theCatalogKeepsIconCountInternalFlagAndPatterns() async throws {
        let transport = FakeTransport.json(#"{"categorias":[\#(Self.categoryBody)]}"#)

        let catalog = try await makeAPI(transport).categorias()

        let category = try #require(catalog.categorias.first)
        #expect(category.icono == "tv")
        #expect(category.transaccionesCount == 12)
        #expect(category.esInterna == false)
        #expect(category.patrones.map(\.patron) == ["NETFLIX", "^SPOT", "HBO"])
        #expect(category.patrones.map(\.matchType) == [.contains, .regex, .other("ENDS_WITH")])
    }

    // MARK: create

    @Test func creatingWithAnIconSendsItAndMapsTheAnswer() async throws {
        let transport = FakeTransport.json(Self.categoryBody, status: .created)

        let created = try await makeAPI(transport).crearCategoria(
            NuevaCategoria(nombre: "Streaming", bucket: .deseos, patron: nil, icono: "tv")
        )

        #expect(created.id == "c-1")
        #expect(created.icono == "tv")
        let sent = try sentObject(transport)
        #expect(Set(sent.keys) == ["nombre", "bucket", "icono"])
        #expect(sent["icono"] as? String == "tv")
    }

    // MARK: update category

    @Test func updatingSendsOnlyTheChangedFieldsToTheCategoryId() async throws {
        let transport = FakeTransport.json(Self.categoryBody)

        let updated = try await makeAPI(transport).actualizarCategoria(id: "c-1", cambios: CategoriaCambios(nombre: "Música"))

        #expect(transport.requests.first?.method == .patch)
        #expect(transport.requests.first?.path == "/api/categorias/c-1")
        #expect(try sentObject(transport) as NSDictionary == ["nombre": "Música"])
        #expect(updated.nombre == "Streaming", "the answer is the server's, not the request")
    }

    @Test func updatingTheBucketSendsTheApiNameAndTheIcon() async throws {
        let transport = FakeTransport.json(Self.categoryBody)

        _ = try await makeAPI(transport).actualizarCategoria(id: "c-1", cambios: CategoriaCambios(bucket: .ahorro, icono: "gift"))

        #expect(try sentObject(transport) as NSDictionary == ["bucket": "Ahorro", "icono": "gift"])
    }

    @Test(arguments: [
        (400, "NOMBRE_INVALIDO", CategoriaError.invalidName),
        (400, "BUCKET_NO_ASIGNABLE", CategoriaError.bucketNotAssignable),
        (400, "ICONO_INVALIDO", CategoriaError.invalidIcon),
        (404, "CATEGORIA_NO_ENCONTRADA", CategoriaError.notFound),
        (409, "NOMBRE_DUPLICADO", CategoriaError.duplicateName),
        (400, "CODIGO_NUEVO", CategoriaError.rejected(message: "texto")),
    ] as [(Int, String, CategoriaError)])
    func eachUpdateCodeMapsToItsError(status: Int, code: String, expected: CategoriaError) async throws {
        let transport = FakeTransport.json(#"{"message":"texto","code":"\#(code)"}"#, status: HTTPResponse.Status(code: status))

        await #expect(throws: expected) {
            _ = try await makeAPI(transport).actualizarCategoria(id: "c-1", cambios: CategoriaCambios(nombre: "X"))
        }
    }

    @Test func aSystemCategoryAnswers403AsProtected() async {
        let transport = FakeTransport.json(#"{"message":"x","code":"CATEGORIA_INTERNA"}"#, status: .forbidden)

        await #expect(throws: CategoriaError.isInternal) {
            _ = try await makeAPI(transport).actualizarCategoria(id: "c-1", cambios: CategoriaCambios(nombre: "X"))
        }
        await #expect(throws: CategoriaError.isInternal) { try await makeAPI(transport).eliminarCategoria(id: "c-1") }
    }

    // MARK: delete category

    @Test func deletingCallsTheCategoryIdAndAcceptsNoContent() async throws {
        let transport = FakeTransport { _ in (HTTPResponse(status: .noContent), nil) }

        try await makeAPI(transport).eliminarCategoria(id: "c-9")

        #expect(transport.requests.first?.method == .delete)
        #expect(transport.requests.first?.path == "/api/categorias/c-9")
        #expect(transport.bodies == [""])
    }

    @Test func deletingAMissingCategoryIsNotFound() async {
        let transport = FakeTransport.json(#"{"message":"x","code":"CATEGORIA_NO_ENCONTRADA"}"#, status: .notFound)

        await #expect(throws: CategoriaError.notFound) { try await makeAPI(transport).eliminarCategoria(id: "c-1") }
    }

    // MARK: patterns

    private static let patternBody = #"{"id":"p-7","categoriaId":"c-1","patron":"UBER","matchType":"STARTS_WITH","prioridad":0}"#

    @Test func creatingAPatternSendsTheCategoryIdTheTextAndTheTypeButNoPriority() async throws {
        let transport = FakeTransport.json(Self.patternBody, status: .created)

        let pattern = try await makeAPI(transport).crearPatron(categoriaId: "c-1", patron: "UBER", matchType: .startsWith)

        #expect(pattern == PatronCategoria(id: "p-7", patron: "UBER", matchType: .startsWith))
        #expect(transport.requests.first?.path == "/api/patrones")
        #expect(try sentObject(transport) as NSDictionary == ["categoriaId": "c-1", "patron": "UBER", "matchType": "STARTS_WITH"])
    }

    @Test func updatingAPatternSendsOnlyWhatChanged() async throws {
        let transport = FakeTransport.json(Self.patternBody)

        _ = try await makeAPI(transport).actualizarPatron(id: "p-7", cambios: PatronCambios(matchType: .regex))

        #expect(transport.requests.first?.method == .patch)
        #expect(transport.requests.first?.path == "/api/patrones/p-7")
        #expect(try sentObject(transport) as NSDictionary == ["matchType": "REGEX"])
    }

    @Test func deletingAPatternCallsItsId() async throws {
        let transport = FakeTransport { _ in (HTTPResponse(status: .noContent), nil) }

        try await makeAPI(transport).eliminarPatron(id: "p-7")

        #expect(transport.requests.first?.method == .delete)
        #expect(transport.requests.first?.path == "/api/patrones/p-7")
    }

    @Test(arguments: [
        (400, "PATRON_INVALIDO", PatronError.invalidPattern),
        (400, "MATCH_TYPE_INVALIDO", PatronError.invalidMatchType),
        (400, "REGEX_INVALIDA", PatronError.invalidRegex),
        (400, "PRIORIDAD_INVALIDA", PatronError.invalidPriority),
        (404, "CATEGORIA_NO_ENCONTRADA", PatronError.categoryNotFound),
        (404, "PATRON_NO_ENCONTRADO", PatronError.patternNotFound),
        (409, "PATRON_DUPLICADO", PatronError.duplicate),
        (400, "CODIGO_NUEVO", PatronError.rejected(message: "texto")),
    ] as [(Int, String, PatronError)])
    func eachPatternCodeMapsToItsError(status: Int, code: String, expected: PatronError) async throws {
        let transport = FakeTransport.json(#"{"message":"texto","code":"\#(code)"}"#, status: HTTPResponse.Status(code: status))

        await #expect(throws: expected) {
            _ = try await makeAPI(transport).crearPatron(categoriaId: "c-1", patron: "x", matchType: .contains)
        }
        await #expect(throws: expected) {
            _ = try await makeAPI(transport).actualizarPatron(id: "p-1", cambios: PatronCambios(patron: "x"))
        }
    }

    @Test func deletingAMissingPatternIsNotFound() async {
        let transport = FakeTransport.json(#"{"message":"x","code":"PATRON_NO_ENCONTRADO"}"#, status: .notFound)

        await #expect(throws: PatronError.patternNotFound) { try await makeAPI(transport).eliminarPatron(id: "p-1") }
    }

    // MARK: session

    @Test func everyCatalogWriteSendsAnExpiredSessionThroughTheSingleRelay() async {
        let transport = FakeTransport.json(#"{"message":"x","code":"SESION_INVALIDA"}"#, status: .unauthorized)
        let expired = LockedBox<[String]>([])
        let api = makeAPI(transport) { token in expired.mutate { $0.append(token) } }

        await #expect(throws: APIError.sessionExpired) { _ = try await api.actualizarCategoria(id: "c", cambios: CategoriaCambios(nombre: "X")) }
        await #expect(throws: APIError.sessionExpired) { try await api.eliminarCategoria(id: "c") }
        await #expect(throws: APIError.sessionExpired) { _ = try await api.crearPatron(categoriaId: "c", patron: "x", matchType: .contains) }
        await #expect(throws: APIError.sessionExpired) { _ = try await api.actualizarPatron(id: "p", cambios: PatronCambios(patron: "x")) }
        await #expect(throws: APIError.sessionExpired) { try await api.eliminarPatron(id: "p") }

        #expect(expired.value == ["tok", "tok", "tok", "tok", "tok"])
    }

    @Test func anUndocumentedStatusIsAPlainApiError() async {
        let transport = FakeTransport.json("{}", status: .internalServerError)

        await #expect(throws: APIError.badStatus(500)) { try await makeAPI(transport).eliminarPatron(id: "p") }
    }
}
