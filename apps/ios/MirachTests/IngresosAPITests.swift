import Foundation
import HTTPTypes
import Testing
@testable import Mirach

struct IngresosAPITests {
    private let serverURL = URL(string: "https://example.test")!
    private let sept = Periodo("2026-09")!

    private func api(_ transport: FakeTransport) -> OpenAPIMirachAPI {
        OpenAPIMirachAPI(serverURL: serverURL, transport: transport)
    }

    private func item(
        id: String = "i-1", fecha: String = "2026-09-02T00:00:00.000Z", descripcion: String = "SUELDO EMPRESA",
        origen: String = "Banco de Chile", monto: String = "1650000"
    ) -> String {
        #"{"id":"\#(id)","fecha":"\#(fecha)","descripcion":"\#(descripcion)","origen":"\#(origen)","monto":"\#(monto)"}"#
    }

    private func body(total: String = "1650000", conteo: Int = 1, items: [String]? = nil) -> String {
        #"{"total":"\#(total)","conteo":\#(conteo),"transacciones":[\#((items ?? [item()]).joined(separator: ","))]}"#
    }

    @Test func mapsTheHeaderAndEachIncomeWithExactMoney() async throws {
        let ingresos = try await api(.json(body())).ingresosMes(periodo: sept)

        #expect(ingresos.total == 1_650_000)
        #expect(ingresos.conteo == 1)
        let income = try #require(ingresos.transacciones.first)
        #expect(income.id == "i-1")
        #expect(income.descripcion == "SUELDO EMPRESA")
        #expect(income.origen == "Banco de Chile")
        #expect(income.monto == 1_650_000)
        #expect(income.fecha == Date(timeIntervalSince1970: 1_788_307_200))
    }

    @Test func theMonthIsTheOneThatWasAskedForBecauseTheResponseHasNone() async throws {
        let ingresos = try await api(.json(body())).ingresosMes(periodo: Periodo("2026-07")!)

        #expect(ingresos.periodo == Periodo("2026-07"))
    }

    @Test func keepsMoneyBeyondDoublePrecisionAndTheServerOrder() async throws {
        let ingresos = try await api(.json(body(
            total: "9007199254740993", conteo: 2,
            items: [item(id: "i-9", monto: "9007199254740993"), item(id: "i-1", monto: "0")]
        ))).ingresosMes(periodo: sept)

        #expect(ingresos.total == 9_007_199_254_740_993)
        #expect(ingresos.transacciones.map(\.id) == ["i-9", "i-1"])
        #expect(ingresos.transacciones[0].monto == 9_007_199_254_740_993)
    }

    @Test func anEmptyMonthHasNoIncomes() async throws {
        let ingresos = try await api(.json(body(total: "0", conteo: 0, items: []))).ingresosMes(periodo: sept)

        #expect(ingresos.transacciones.isEmpty)
        #expect(ingresos.total == 0)
        #expect(ingresos.conteo == 0)
    }

    @Test func aManualOriginAndAnOddDescriptionAreKeptVerbatim() async throws {
        let ingresos = try await api(.json(body(items: [item(descripcion: "  Abono ñandú — 50% ", origen: "Manual")])))
            .ingresosMes(periodo: sept)

        #expect(ingresos.transacciones[0].origen == "Manual")
        #expect(ingresos.transacciones[0].descripcion == "  Abono ñandú — 50% ")
    }

    @Test func rejectsBodiesTheAppCannotTrust() async {
        let broken = [
            body(total: "12,5"),
            body(total: "1.5"),
            body(total: ""),
            body(items: [item(monto: "oops")]),
            body(items: [item(monto: "1e3")]),
            body(items: [item(fecha: "ayer")]),
        ]
        for text in broken {
            await #expect(throws: DecodingError.self) {
                _ = try await api(.json(text)).ingresosMes(periodo: sept)
            }
        }
    }

    @Test func asksForTheMonthByItsApiValue() async throws {
        let transport = FakeTransport.json(body())

        _ = try await api(transport).ingresosMes(periodo: sept)

        #expect(transport.requests.map(\.path) == ["/api/ingresos/mes?periodo=2026-09"])
    }

    @Test func aRejectedSessionNotifiesWithTheTokenSent() async {
        let seen = SeenTokens()
        let transport = FakeTransport.json(#"{"message":"x","code":"SESION_INVALIDA"}"#, status: .unauthorized)
        let api = OpenAPIMirachAPI(
            serverURL: serverURL, transport: transport,
            currentToken: { "tok-sent" }, onSessionExpired: { seen.add($0) }
        )

        await #expect(throws: APIError.sessionExpired) { _ = try await api.ingresosMes(periodo: sept) }
        #expect(seen.tokens == ["tok-sent"])
    }

    @Test func aRejectedKeyIsNotASessionExpiry() async {
        let seen = SeenTokens()
        let transport = FakeTransport.json(#"{"message":"x","code":"API_KEY_INVALIDA"}"#, status: .unauthorized)
        let api = OpenAPIMirachAPI(
            serverURL: serverURL, transport: transport,
            currentToken: { "tok-sent" }, onSessionExpired: { seen.add($0) }
        )

        await #expect(throws: APIError.apiKeyRejected) { _ = try await api.ingresosMes(periodo: sept) }
        #expect(seen.tokens.isEmpty)
    }

    @Test func aServerErrorKeepsItsStatus() async {
        let transport = FakeTransport.json(#"{"message":"x"}"#, status: .serviceUnavailable)

        await #expect(throws: APIError.badStatus(503)) { _ = try await api(transport).ingresosMes(periodo: sept) }
    }
}

private final class SeenTokens: @unchecked Sendable {
    private let lock = NSLock()
    private var _tokens: [String] = []
    func add(_ token: String) { lock.withLock { _tokens.append(token) } }
    var tokens: [String] { lock.withLock { _tokens } }
}
