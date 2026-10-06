import Foundation
import HTTPTypes
import Testing
@testable import Mirach

/// The upload endpoints through the real generated client and a fake transport: what the
/// adapter sends, and how each answer in the catalog's tables becomes an app-owned result.
struct IngestaAPITests {
    private let serverURL = URL(string: "https://example.test")!

    private func makeAPI(_ transport: FakeTransport, expired: @escaping @Sendable (String) -> Void = { _ in }) -> OpenAPIMirachAPI {
        OpenAPIMirachAPI(
            serverURL: serverURL, transport: transport,
            currentToken: { "tok" }, onSessionExpired: expired
        )
    }

    /// A real (tiny) file on disk, as the staging step would leave it.
    private func stagedFile(named name: String = "cartola.xlsx", contents: String = "FILE-BYTES") throws -> CartolaFile {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString)-\(name)")
        try Data(contents.utf8).write(to: url)
        return CartolaFile(url: url, filename: name, byteCount: contents.utf8.count)
    }

    private static let previewBody = """
    {"banco":"Banco de Chile","tipoCuenta":"Cuenta Corriente","numeroCuenta":"00-123-45678-09",
     "estructura":{"totalFilasDatos":42},"muestra":[],
     "resumen":{"totalFilas":42,"duplicadosDetectados":5,"nuevas":37},"filas":[]}
    """

    private static let commitBody = """
    {"ingestaId":"i-1","totalTransacciones":37,"duplicadosOmitidos":5,"transacciones":[]}
    """

    // MARK: preview

    @Test func previewMapsTheResponseToTheAppModel() async throws {
        let transport = FakeTransport.json(Self.previewBody)

        let preview = try await makeAPI(transport).previewIngesta(file: stagedFile(), password: nil)

        #expect(preview == CartolaPreview(
            banco: "Banco de Chile", tipoCuenta: "Cuenta Corriente", numeroCuenta: "00-123-45678-09",
            totalFilas: 42, duplicados: 5, nuevas: 37, filas: []
        ))
        #expect(transport.requests.first?.path == "/api/ingestas/preview")
    }

    private static func previewBody(rows: String) -> String {
        """
        {"banco":"BCI","tipoCuenta":"Cuenta Vista","numeroCuenta":"1","estructura":{"totalFilasDatos":4},
         "muestra":[],"resumen":{"totalFilas":4,"duplicadosDetectados":1,"nuevas":3},"filas":[\(rows)]}
        """
    }

    @Test func previewMapsEveryRowWithMoneyDateDuplicateAndSuggestion() async throws {
        let rows = """
        {"rowIndex":0,"fecha":"2026-10-03T00:00:00.000Z","descripcion":"LIDER","cargo":"25990","abono":"0",
         "esDuplicado":false,"sugerido":{"bucket":"Necesidades","categoriaId":"cat-1"}},
        {"rowIndex":1,"fecha":"2026-10-04T00:00:00.000Z","descripcion":"SUELDO","cargo":"0","abono":"1200000.00",
         "esDuplicado":false,"sugerido":null},
        {"rowIndex":2,"fecha":"2026-10-05T00:00:00Z","descripcion":"COPEC","cargo":"30000","abono":"0",
         "esDuplicado":true,"sugerido":{"bucket":"Deseos","categoriaId":null}}
        """
        let transport = FakeTransport.json(Self.previewBody(rows: rows))

        let preview = try await makeAPI(transport).previewIngesta(file: stagedFile(), password: nil)

        #expect(preview.filas == [
            CartolaRow(
                rowIndex: 0, fecha: Date(timeIntervalSince1970: 1_790_985_600), descripcion: "LIDER",
                cargo: 25_990, abono: 0, esDuplicado: false, sugerido: .init(bucket: .necesidades, categoriaId: "cat-1")
            ),
            CartolaRow(
                rowIndex: 1, fecha: Date(timeIntervalSince1970: 1_791_072_000), descripcion: "SUELDO",
                cargo: 0, abono: 1_200_000, esDuplicado: false, sugerido: nil
            ),
            CartolaRow(
                rowIndex: 2, fecha: Date(timeIntervalSince1970: 1_791_158_400), descripcion: "COPEC",
                cargo: 30_000, abono: 0, esDuplicado: true, sugerido: .init(bucket: .deseos, categoriaId: nil)
            ),
        ])
    }

    @Test func aSuggestionWithAnUnknownBucketCountsAsNoSuggestion() async throws {
        let rows = """
        {"rowIndex":0,"fecha":"2026-10-03T00:00:00.000Z","descripcion":"X","cargo":"1","abono":"0",
         "esDuplicado":false,"sugerido":{"bucket":"Gustos","categoriaId":"c"}}
        """
        let transport = FakeTransport.json(Self.previewBody(rows: rows))

        let preview = try await makeAPI(transport).previewIngesta(file: stagedFile(), password: nil)

        #expect(preview.filas.count == 1)
        #expect(preview.filas.first?.sugerido == nil)
    }

    @Test func aRowWithAnUnreadableAmountOrDateFailsTheWholePreview() async throws {
        let badAmount = """
        {"rowIndex":0,"fecha":"2026-10-03T00:00:00.000Z","descripcion":"X","cargo":"abc","abono":"0",
         "esDuplicado":false,"sugerido":null}
        """
        let badDate = """
        {"rowIndex":0,"fecha":"ayer","descripcion":"X","cargo":"1","abono":"0","esDuplicado":false,"sugerido":null}
        """
        let file = try stagedFile()

        for rows in [badAmount, badDate] {
            await #expect(throws: DecodingError.self) {
                _ = try await makeAPI(FakeTransport.json(Self.previewBody(rows: rows))).previewIngesta(file: file, password: nil)
            }
        }
    }

    // MARK: categorias

    private static func category(_ id: String, _ name: String, _ bucket: String) -> String {
        """
        {"id":"\(id)","nombre":"\(name)","bucket":"\(bucket)","icono":null,"esInterna":false,
         "patrones":[],"transaccionesCount":0}
        """
    }

    @Test func categoriasMapsTheCatalogAndDropsABucketTheAppDoesNotKnow() async throws {
        let body = """
        {"categorias":[\(Self.category("a", "Arriendo", "Necesidades")),\(Self.category("b", "Cine", "Deseos")),\(Self.category("c", "Otra", "Gustos"))]}
        """
        let transport = FakeTransport.json(body)

        let catalog = try await makeAPI(transport).categorias()

        #expect(catalog == CatalogoCategorias(categorias: [
            CategoriaCatalogo(id: "a", nombre: "Arriendo", bucket: .necesidades),
            CategoriaCatalogo(id: "b", nombre: "Cine", bucket: .deseos),
        ]))
        #expect(transport.requests.first?.path == "/api/categorias")
    }

    @Test func categoriasGoesThroughTheSingleExpiryRelayOn401() async {
        let transport = FakeTransport.json(#"{"message":"x","code":"SESION_INVALIDA"}"#, status: .unauthorized)
        let expired = LockedBox<[String]>([])

        await #expect(throws: APIError.sessionExpired) {
            _ = try await makeAPI(transport, expired: { token in expired.mutate { $0.append(token) } }).categorias()
        }

        #expect(expired.value == ["tok"])
    }

    @Test func previewSendsTheFileAndOnlyTheFileWithoutPassword() async throws {
        let transport = FakeTransport.json(Self.previewBody)

        _ = try await makeAPI(transport).previewIngesta(file: stagedFile(named: "mi cartola.xlsx"), password: nil)

        let body = try #require(transport.bodies.first)
        #expect(body.contains(#"name="file""#))
        #expect(body.contains(#"filename="mi cartola.xlsx""#))
        #expect(body.contains("FILE-BYTES"))
        #expect(!body.contains(#"name="password""#))
    }

    @Test func previewSendsThePasswordWhenThereIsOne() async throws {
        let transport = FakeTransport.json(Self.previewBody)

        _ = try await makeAPI(transport).previewIngesta(file: stagedFile(named: "c.pdf"), password: "s3creta")

        let body = try #require(transport.bodies.first)
        #expect(body.contains(#"name="password""#))
        #expect(body.contains("s3creta"))
    }

    @Test func previewTreatsAnEmptyPasswordAsNoPassword() async throws {
        let transport = FakeTransport.json(Self.previewBody)

        _ = try await makeAPI(transport).previewIngesta(file: stagedFile(), password: "")

        #expect(try #require(transport.bodies.first).contains(#"name="password""#) == false)
    }

    @Test(arguments: [
        ("PDF_PROTEGIDO", IngestaError.passwordRequired),
        ("PDF_PASSWORD_INCORRECTA", IngestaError.passwordIncorrect),
        ("SIN_MOVIMIENTOS", IngestaError.noMovements),
    ])
    func previewMapsTheNamed400Codes(code: String, expected: IngestaError) async throws {
        let transport = FakeTransport.json(#"{"message":"texto del servidor","code":"\#(code)"}"#, status: .badRequest)
        let file = try stagedFile()

        await #expect(throws: expected) {
            _ = try await makeAPI(transport).previewIngesta(file: file, password: nil)
        }
    }

    @Test func previewKeepsTheServerMessageOfAGeneric400() async throws {
        let transport = FakeTransport.json(#"{"message":"Banco no reconocido"}"#, status: .badRequest)
        let file = try stagedFile()

        await #expect(throws: IngestaError.rejected(message: "Banco no reconocido")) {
            _ = try await makeAPI(transport).previewIngesta(file: file, password: nil)
        }
    }

    @Test func previewDoesNotFailOnAnUnknown400CodeAndStillShowsTheMessage() async throws {
        // A code the app has never heard of must not hide the server's message.
        let transport = FakeTransport.json(#"{"message":"Algo nuevo","code":"CODIGO_FUTURO"}"#, status: .badRequest)
        let file = try stagedFile()

        await #expect(throws: IngestaError.rejected(message: "Algo nuevo")) {
            _ = try await makeAPI(transport).previewIngesta(file: file, password: nil)
        }
    }

    @Test func previewMapsCatalogUnavailableAndServerFailure() async throws {
        let file = try stagedFile()
        let unavailable = FakeTransport.json(
            #"{"message":"x","code":"CATALOGO_NO_DISPONIBLE"}"#, status: .serviceUnavailable
        )
        let failing = FakeTransport.json(#"{"message":"boom"}"#, status: .internalServerError)

        await #expect(throws: IngestaError.catalogUnavailable) {
            _ = try await makeAPI(unavailable).previewIngesta(file: file, password: nil)
        }
        await #expect(throws: IngestaError.serverFailure) {
            _ = try await makeAPI(failing).previewIngesta(file: file, password: nil)
        }
    }

    @Test func previewSendsAnExpiredSessionThroughTheSingleRelay() async throws {
        let transport = FakeTransport.json(#"{"message":"x","code":"SESION_INVALIDA"}"#, status: .unauthorized)
        let expired = LockedBox<[String]>([])
        let file = try stagedFile()

        await #expect(throws: APIError.sessionExpired) {
            _ = try await makeAPI(transport, expired: { token in expired.mutate { $0.append(token) } })
                .previewIngesta(file: file, password: nil)
        }
        #expect(expired.value == ["tok"])
    }

    @Test func previewRejectsAResponseWithoutTheSummary() async throws {
        // `resumen` is optional in the contract but the screen cannot show a decision without it.
        let body = #"{"banco":"B","tipoCuenta":"T","numeroCuenta":"1","estructura":{"totalFilasDatos":1},"muestra":[]}"#
        let file = try stagedFile()

        do {
            _ = try await makeAPI(FakeTransport.json(body)).previewIngesta(file: file, password: nil)
            Issue.record("expected a decoding error")
        } catch {
            #expect(error is DecodingError)
        }
    }

    @Test func previewRethrowsTransportErrors() async throws {
        let file = try stagedFile()

        await #expect(throws: URLError(.notConnectedToInternet)) {
            _ = try await makeAPI(FakeTransport.failing(URLError(.notConnectedToInternet)))
                .previewIngesta(file: file, password: nil)
        }
    }

    @Test func previewReportsAMissingStagedCopyAsUnreadable() async {
        let gone = CartolaFile(url: URL(fileURLWithPath: "/nonexistent/cartola.xlsx"), filename: "cartola.xlsx", byteCount: 1)

        await #expect(throws: IngestaError.fileUnreadable) {
            _ = try await makeAPI(FakeTransport.json(Self.previewBody)).previewIngesta(file: gone, password: nil)
        }
    }

    @Test func previewSendsAnUndecodable401ThroughTheSingleRelay() async throws {
        let transport = FakeTransport.json(#"{"message":"x","code":"CODIGO_NUEVO"}"#, status: .unauthorized)
        let expired = LockedBox<[String]>([])
        let file = try stagedFile()

        await #expect(throws: APIError.sessionExpired) {
            _ = try await makeAPI(transport, expired: { token in expired.mutate { $0.append(token) } })
                .previewIngesta(file: file, password: nil)
        }
        #expect(expired.value == ["tok"])
    }

    @Test func commitSendsAnUndecodable401ThroughTheSingleRelay() async throws {
        let transport = FakeTransport.json("not json", status: .unauthorized)
        let expired = LockedBox<[String]>([])
        let file = try stagedFile()

        await #expect(throws: APIError.sessionExpired) {
            _ = try await makeAPI(transport, expired: { token in expired.mutate { $0.append(token) } })
                .commitIngesta(file: file, password: nil, edits: [])
        }
        #expect(expired.value == ["tok"])
    }

    @Test func anUndecodable401NamingTheApiKeyIsNotASessionExpiry() async throws {
        let transport = FakeTransport.json(#"{"message":"x","code":"API_KEY_INVALIDA","extra":1}"#, status: .unauthorized)
        let expired = LockedBox<[String]>([])
        let file = try stagedFile()

        await #expect(throws: APIError.apiKeyRejected) {
            _ = try await makeAPI(transport, expired: { token in expired.mutate { $0.append(token) } })
                .previewIngesta(file: file, password: nil)
        }
        #expect(expired.value.isEmpty)
    }

    // MARK: crearCategoria

    private static let createdBody = """
    {"id":"new-1","nombre":"Streaming","bucket":"Deseos","icono":null,"esInterna":false,"patrones":[],"transaccionesCount":0}
    """

    @Test func creatingACategorySendsTheContractsBodyAndMapsTheAnswer() async throws {
        let transport = FakeTransport.json(Self.createdBody, status: .created)

        let created = try await makeAPI(transport).crearCategoria(
            NuevaCategoria(nombre: "Streaming", bucket: .deseos, patron: "NETFLIX")
        )

        #expect(created == CategoriaCatalogo(id: "new-1", nombre: "Streaming", bucket: .deseos))
        #expect(transport.requests.first?.path == "/api/categorias")
        #expect(transport.requests.first?.method == .post)
        let body = try #require(transport.bodies.first)
        let sent = try #require(try JSONSerialization.jsonObject(with: Data(body.utf8)) as? [String: Any])
        #expect(Set(sent.keys) == ["nombre", "bucket", "patrones"], "no icono, no prioridad")
        #expect(sent["nombre"] as? String == "Streaming")
        #expect(sent["bucket"] as? String == "Deseos")
        let patterns = try #require(sent["patrones"] as? [[String: String]])
        #expect(patterns == [["patron": "NETFLIX", "matchType": "CONTAINS"]])
    }

    @Test(arguments: [nil, "", "   "] as [String?])
    func withoutAPatternTheBodyHasNoPatrones(pattern: String?) async throws {
        let transport = FakeTransport.json(Self.createdBody, status: .created)

        _ = try await makeAPI(transport).crearCategoria(NuevaCategoria(nombre: "X", bucket: .ahorro, patron: pattern))

        let body = try #require(transport.bodies.first)
        let sent = try #require(try JSONSerialization.jsonObject(with: Data(body.utf8)) as? [String: Any])
        #expect(Set(sent.keys) == ["nombre", "bucket"])
        #expect(sent["bucket"] as? String == "Ahorro")
    }

    @Test(arguments: [
        (400, "NOMBRE_INVALIDO", nil, CategoriaError.invalidName),
        (400, "BUCKET_NO_ASIGNABLE", nil, CategoriaError.bucketNotAssignable),
        (400, "ICONO_INVALIDO", nil, CategoriaError.invalidIcon),
        (400, "PATRON_INVALIDO", 0, CategoriaError.invalidPattern(index: 0)),
        (400, "MATCH_TYPE_INVALIDO", 2, CategoriaError.invalidMatchType(index: 2)),
        (400, "REGEX_INVALIDA", 1, CategoriaError.invalidRegex(index: 1)),
        (409, "NOMBRE_DUPLICADO", nil, CategoriaError.duplicateName),
        (409, "PATRON_DUPLICADO", 0, CategoriaError.duplicatePattern(index: 0)),
        (409, "PATRON_DUPLICADO", nil, CategoriaError.duplicatePattern(index: nil)),
        (400, "CODIGO_NUEVO", nil, CategoriaError.rejected(message: "texto")),
        (409, "OTRO_NUEVO", nil, CategoriaError.rejected(message: "texto")),
    ] as [(Int, String, Int?, CategoriaError)])
    func eachNamedCodeMapsToItsError(status: Int, code: String, index: Int?, expected: CategoriaError) async throws {
        let indice = index.map { #","indice":\#($0)"# } ?? ""
        let transport = FakeTransport.json(
            #"{"message":"texto","code":"\#(code)"\#(indice)}"#, status: HTTPResponse.Status(code: status)
        )

        await #expect(throws: expected) {
            _ = try await makeAPI(transport).crearCategoria(NuevaCategoria(nombre: "X", bucket: .deseos, patron: "a"))
        }
    }

    @Test func creatingACategorySendsAnExpiredSessionThroughTheSingleRelay() async {
        let transport = FakeTransport.json(#"{"message":"x","code":"SESION_INVALIDA"}"#, status: .unauthorized)
        let expired = LockedBox<[String]>([])

        await #expect(throws: APIError.sessionExpired) {
            _ = try await makeAPI(transport, expired: { token in expired.mutate { $0.append(token) } })
                .crearCategoria(NuevaCategoria(nombre: "X", bucket: .deseos, patron: nil))
        }

        #expect(expired.value == ["tok"])
    }

    @Test func aServerFailureWhileCreatingIsNotACatalogError() async {
        let transport = FakeTransport.json(#"{"message":"boom"}"#, status: .internalServerError)

        await #expect(throws: (any Error).self) {
            _ = try await makeAPI(transport).crearCategoria(NuevaCategoria(nombre: "X", bucket: .deseos, patron: nil))
        }
    }

    // MARK: commit

    @Test func commitReportsAMissingStagedCopyAsUnreadable() async {
        let gone = CartolaFile(url: URL(fileURLWithPath: "/nonexistent/cartola.xlsx"), filename: "cartola.xlsx", byteCount: 1)

        await #expect(throws: IngestaError.fileUnreadable) {
            _ = try await makeAPI(FakeTransport.json(Self.commitBody, status: .created))
                .commitIngesta(file: gone, password: nil, edits: [])
        }
    }

    @Test func commitSendsTheFileAnEmptyEditsListAndThePassword() async throws {
        let transport = FakeTransport.json(Self.commitBody, status: .created)

        let result = try await makeAPI(transport).commitIngesta(
            file: stagedFile(named: "c.pdf"), password: "s3creta", edits: []
        )

        #expect(result == CartolaCommitResult(totalTransacciones: 37, duplicadosOmitidos: 5))
        #expect(transport.requests.first?.path == "/api/ingestas/commit")
        let body = try #require(transport.bodies.first)
        #expect(body.contains(#"name="edits""#))
        #expect(body.contains("\r\n\r\n[]\r\n"))
        #expect(body.contains(#"name="password""#))
        #expect(body.contains("FILE-BYTES"))
    }

    @Test func commitEncodesTheTouchedRowsAsJSON() async throws {
        let transport = FakeTransport.json(Self.commitBody, status: .created)

        _ = try await makeAPI(transport).commitIngesta(
            file: stagedFile(), password: nil, edits: [CartolaEdit(rowIndex: 3, categoriaId: "cat-1")]
        )

        let body = try #require(transport.bodies.first)
        #expect(body.contains(#"[{"rowIndex":3,"categoriaId":"cat-1"}]"#))
    }

    @Test func theEditsJSONIsExactlyTheContractsShapeAndEscapesTheId() {
        #expect(CartolaEdit.json([]) == "[]")
        #expect(
            CartolaEdit.json([CartolaEdit(rowIndex: 3, categoriaId: "a"), CartolaEdit(rowIndex: 7, categoriaId: #"b"c"#)])
                == #"[{"rowIndex":3,"categoriaId":"a"},{"rowIndex":7,"categoriaId":"b\"c"}]"#
        )
    }

    @Test func commitMapsConflictToCatalogIncompleteAndTheOthersLikePreview() async throws {
        let file = try stagedFile()
        let conflict = FakeTransport.json(#"{"message":"texto del servidor","code":"CATALOGO_INCOMPLETO"}"#, status: .conflict)
        let unavailable = FakeTransport.json(
            #"{"message":"x","code":"CATALOGO_NO_DISPONIBLE"}"#, status: .serviceUnavailable
        )
        let failing = FakeTransport.json(#"{"message":"boom"}"#, status: .internalServerError)
        let rejected = FakeTransport.json(#"{"message":"Archivo inválido"}"#, status: .badRequest)

        await #expect(throws: IngestaError.catalogIncomplete) {
            _ = try await makeAPI(conflict).commitIngesta(file: file, password: nil, edits: [])
        }
        await #expect(throws: IngestaError.catalogUnavailable) {
            _ = try await makeAPI(unavailable).commitIngesta(file: file, password: nil, edits: [])
        }
        await #expect(throws: IngestaError.serverFailure) {
            _ = try await makeAPI(failing).commitIngesta(file: file, password: nil, edits: [])
        }
        await #expect(throws: IngestaError.rejected(message: "Archivo inválido")) {
            _ = try await makeAPI(rejected).commitIngesta(file: file, password: nil, edits: [])
        }
    }

    @Test func commitSendsAnExpiredSessionThroughTheSingleRelay() async throws {
        let transport = FakeTransport.json(#"{"message":"x","code":"SESION_INVALIDA"}"#, status: .unauthorized)
        let file = try stagedFile()

        await #expect(throws: APIError.sessionExpired) {
            _ = try await makeAPI(transport).commitIngesta(file: file, password: nil, edits: [])
        }
    }
}

/// A tiny thread-safe box so a `@Sendable` callback can record into the test.
final class LockedBox<Value: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: Value
    init(_ value: Value) { stored = value }
    var value: Value { lock.withLock { stored } }
    func mutate(_ change: (inout Value) -> Void) { lock.withLock { change(&stored) } }
}

