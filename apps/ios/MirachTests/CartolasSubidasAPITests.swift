import Foundation
import HTTPTypes
import Testing
@testable import Mirach

/// `GET /api/ingestas` and `DELETE /api/ingestas/{id}` through the real generated client.
struct CartolasSubidasAPITests {
    private let serverURL = URL(string: "https://example.test")!

    private final class Expiry: @unchecked Sendable {
        private let lock = NSLock()
        private var _tokens: [String] = []
        func fire(_ token: String) { lock.withLock { _tokens.append(token) } }
        var tokens: [String] { lock.withLock { _tokens } }
    }

    private func api(_ transport: FakeTransport, expiry: Expiry = Expiry()) -> OpenAPIMirachAPI {
        OpenAPIMirachAPI(
            serverURL: serverURL, transport: transport,
            currentToken: { "tok-sent" }, onSessionExpired: { expiry.fire($0) }
        )
    }

    private func item(
        id: String = "g-1", banco: String? = "Banco de Chile", archivo: String = "cartola.xlsx",
        estado: String = "PROCESADA", motivo: String? = nil, fecha: String = "2026-10-03T14:20:00.000Z", total: Int = 37
    ) -> String {
        let bank = banco.map { #""\#($0)""# } ?? "null"
        let reason = motivo.map { #""\#($0)""# } ?? "null"
        return #"{"id":"\#(id)","banco":\#(bank),"nombreArchivo":"\#(archivo)","estado":"\#(estado)","motivoFallo":\#(reason),"fecha":"\#(fecha)","totalTransacciones":\#(total)}"#
    }

    private func body(_ items: [String]) -> String { #"{"ingestas":[\#(items.joined(separator: ","))]}"# }

    @Test func mapsAProcessedImportWithItsCount() async throws {
        let list = try await api(.json(body([item()]))).cartolasSubidas()

        let cartola = try #require(list.first)
        #expect(cartola.id == "g-1")
        #expect(cartola.banco == "Banco de Chile")
        #expect(cartola.nombreArchivo == "cartola.xlsx")
        #expect(cartola.estado == .procesada)
        #expect(cartola.motivoFallo == nil)
        #expect(cartola.totalTransacciones == 37)
        #expect(cartola.fecha == Date(timeIntervalSince1970: 1_791_037_200))
    }

    @Test func theDateIsReadAsUTC() async throws {
        let list = try await api(.json(body([item(fecha: "2026-10-03T00:00:00.000Z")]))).cartolasSubidas()

        #expect(list[0].fecha == Date(timeIntervalSince1970: 1_790_985_600))
        #expect(Format.shortDate(list[0].fecha) == "3 oct")
    }

    @Test func aFailedImportKeepsItsReasonAndAnUnresolvedBankIsNil() async throws {
        let list = try await api(.json(body([
            item(id: "g-2", banco: nil, archivo: "raro.pdf", estado: "FALLIDA", motivo: "Formato no reconocido", total: 0)
        ]))).cartolasSubidas()

        let cartola = try #require(list.first)
        #expect(cartola.estado == .fallida)
        #expect(cartola.banco == nil)
        #expect(cartola.motivoFallo == "Formato no reconocido")
    }

    @Test func keepsTheServerOrderAndAnEmptyListIsEmpty() async throws {
        let list = try await api(.json(body([item(id: "g-9"), item(id: "g-3"), item(id: "g-5")]))).cartolasSubidas()
        #expect(list.map(\.id) == ["g-9", "g-3", "g-5"])

        #expect(try await api(.json(body([]))).cartolasSubidas().isEmpty)
    }

    @Test func aMalformedDateIsRejectedInsteadOfShownWrong() async {
        await #expect(throws: DecodingError.self) {
            _ = try await api(.json(body([item(fecha: "ayer")]))).cartolasSubidas()
        }
    }

    @Test func listingMapsErrors() async {
        let expiry = Expiry()
        let unauthorized = FakeTransport.json(#"{"message":"x","code":"SESION_INVALIDA"}"#, status: .unauthorized)
        await #expect(throws: APIError.sessionExpired) { _ = try await api(unauthorized, expiry: expiry).cartolasSubidas() }
        #expect(expiry.tokens == ["tok-sent"])

        await #expect(throws: APIError.badStatus(503)) {
            _ = try await api(.json("{}", status: .serviceUnavailable)).cartolasSubidas()
        }
        await #expect(throws: URLError.self) { _ = try await api(.failing(URLError(.timedOut))).cartolasSubidas() }
    }

    // MARK: DELETE

    @Test func deleteSendsTheIdInThePathWithTheDeleteMethod() async throws {
        let transport = FakeTransport { _ in (HTTPResponse(status: .noContent), nil) }

        try await api(transport).eliminarCartola(id: "g-1")

        #expect(transport.requests.first?.method == .delete)
        #expect(transport.requests.first?.path == "/api/ingestas/g-1")
    }

    @Test func aMissingImportIsTypedSoTheScreenCanDropItFromTheList() async {
        let transport = FakeTransport { _ in (HTTPResponse(status: .notFound), nil) }

        await #expect(throws: EliminarCartolaError.notFound) { try await api(transport).eliminarCartola(id: "g-1") }
    }

    @Test func deleteMapsSessionAndServerFailures() async {
        let expiry = Expiry()
        let unauthorized = FakeTransport.json(#"{"message":"x","code":"SESION_INVALIDA"}"#, status: .unauthorized)
        await #expect(throws: APIError.sessionExpired) { try await api(unauthorized, expiry: expiry).eliminarCartola(id: "g-1") }
        #expect(expiry.tokens == ["tok-sent"])

        await #expect(throws: APIError.badStatus(500)) {
            try await api(.json("{}", status: .internalServerError)).eliminarCartola(id: "g-1")
        }
    }
}
