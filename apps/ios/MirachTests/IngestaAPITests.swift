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
            totalFilas: 42, duplicados: 5, nuevas: 37
        ))
        #expect(transport.requests.first?.path == "/api/ingestas/preview")
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
        // Key order is up to the encoder; the server parses it as JSON.
        #expect(body.contains(#""rowIndex":3"#))
        #expect(body.contains(#""categoriaId":"cat-1""#))
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
