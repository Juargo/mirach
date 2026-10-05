import Foundation
import HTTPTypes
import Testing
@testable import Mirach

struct ResumenMapperTests {
    private let serverURL = URL(string: "https://example.test")!

    private func api(_ transport: FakeTransport) -> OpenAPIMirachAPI {
        OpenAPIMirachAPI(serverURL: serverURL, transport: transport)
    }

    /// A `GET /api/resumen` body. Each bucket is `(name, total, porcentajeBp, estado)` with the
    /// last two already JSON text (`null`, `"verde"`, `""`...).
    private func body(
        periodo: String = "2026-09",
        estadoGlobal: String = #""amarillo""#,
        ingreso: String = "1000000",
        sinIngreso: Bool = false,
        buckets: [(String, String, String, String)] = [
            ("Necesidades", "450000", "4500", #""verde""#),
            ("Deseos", "305000", "3050", #""amarillo""#),
            ("Ahorro", "0", "0", "null"),
        ]
    ) -> String {
        let list = buckets.map { name, total, bp, estado in
            #"{"bucket":"\#(name)","total":"\#(total)","porcentajeBp":\#(bp),"participacionGastoBp":null,"estadoSemaforo":\#(estado)}"#
        }.joined(separator: ",")
        return #"{"periodo":"\#(periodo)","sinIngreso":\#(sinIngreso),"totalIngreso":"\#(ingreso)","estadoGlobal":\#(estadoGlobal),"targets":{"Necesidades":50,"Deseos":30,"Ahorro":20},"buckets":[\#(list)]}"#
    }

    @Test func mapsAMonthWithExactMoneyAndBasisPoints() async throws {
        let mes = try await api(.json(body())).resumen(periodo: nil)

        #expect(mes.periodo == Periodo("2026-09"))
        #expect(mes.totalIngreso == 1_000_000)
        #expect(mes.estadoGlobal == .amarillo)
        #expect(mes.buckets.map(\.bucket) == [.necesidades, .deseos, .ahorro])
        #expect(mes.buckets.map(\.total) == [450_000, 305_000, 0])
        #expect(mes.buckets.map(\.porcentajeBp) == [4500, 3050, 0])
        #expect(mes.buckets.map(\.metaBp) == [5000, 3000, 2000])
    }

    @Test func keepsMoneyBeyondDoublePrecisionExact() async throws {
        // 2^53 + 1 is the first integer a Double cannot hold.
        let big = "9007199254740993"
        let mes = try await api(.json(body(ingreso: big, buckets: [
            ("Necesidades", big, "5000", "null"), ("Deseos", "-1500", "0", "null"), ("Ahorro", "0", "0", "null"),
        ]))).resumen(periodo: nil)

        #expect(mes.totalIngreso == 9_007_199_254_740_993)
        #expect(mes.buckets[0].total == 9_007_199_254_740_993)
        #expect(mes.buckets[1].total == -1500)
    }

    @Test func aNullStateAndTheGeneratedEmptyCaseBothMeanNoState() async throws {
        // `null` is a missing/nil value; "" is what the generator calls `._empty`.
        for estado in ["null", #""""#] {
            let mes = try await api(.json(body(
                estadoGlobal: estado,
                buckets: [
                    ("Necesidades", "1", "1", estado), ("Deseos", "1", "1", #""rojo""#), ("Ahorro", "1", "1", estado),
                ]
            ))).resumen(periodo: nil)

            #expect(mes.estadoGlobal == nil)
            #expect(mes.buckets.map(\.estado) == [nil, .rojo, nil])
        }
    }

    @Test func mapsEveryStateValue() async throws {
        let mes = try await api(.json(body(
            estadoGlobal: #""rojo""#,
            buckets: [
                ("Necesidades", "1", "1", #""verde""#), ("Deseos", "1", "1", #""amarillo""#), ("Ahorro", "1", "1", #""rojo""#),
            ]
        ))).resumen(periodo: nil)

        #expect(mes.estadoGlobal == .rojo)
        #expect(mes.buckets.map(\.estado) == [.verde, .amarillo, .rojo])
    }

    @Test func aMonthWithoutIncomeHasNoPercentages() async throws {
        let mes = try await api(.json(body(
            estadoGlobal: "null", ingreso: "0", sinIngreso: true,
            buckets: [("Necesidades", "0", "null", "null"), ("Deseos", "0", "null", "null"), ("Ahorro", "0", "null", "null")]
        ))).resumen(periodo: nil)

        #expect(mes.sinIngreso)
        #expect(mes.buckets.map(\.porcentajeBp) == [nil, nil, nil])
    }

    @Test func putsBucketsInCatalogOrderWhateverTheServerSends() async throws {
        let mes = try await api(.json(body(buckets: [
            ("Ahorro", "3", "3", "null"), ("Necesidades", "1", "1", "null"), ("Deseos", "2", "2", "null"),
        ]))).resumen(periodo: nil)

        #expect(mes.buckets.map(\.bucket) == [.necesidades, .deseos, .ahorro])
        #expect(mes.buckets.map(\.total) == [1, 2, 3])
    }

    @Test func rejectsBodiesTheAppCannotTrust() async {
        let broken = [
            body(periodo: "2026-13"),
            body(ingreso: "12,5"),
            body(buckets: [("Otros", "1", "1", "null"), ("Deseos", "1", "1", "null"), ("Ahorro", "1", "1", "null")]),
            body(buckets: [("Necesidades", "1", "1", "null")]),
            // A repeated bucket must not silently replace the first one.
            body(buckets: [("Necesidades", "1", "1", "null"), ("Necesidades", "2", "2", "null"), ("Deseos", "1", "1", "null"), ("Ahorro", "1", "1", "null")]),
        ]
        for text in broken {
            await #expect(throws: DecodingError.self) {
                _ = try await api(.json(text)).resumen(periodo: nil)
            }
        }
    }

    @Test func sendsThePeriodOnlyWhenAsked() async throws {
        let transport = FakeTransport.json(body())

        _ = try await api(transport).resumen(periodo: nil)
        _ = try await api(transport).resumen(periodo: Periodo("2026-07"))

        #expect(transport.requests.map(\.path) == ["/api/resumen", "/api/resumen?periodo=2026-07"])
    }

    @Test func mapsThePeriodsListKeepingTheServerOrder() async throws {
        let list = try await api(.json(#"{"periodos":["2026-09","2026-07","2025-12"]}"#)).periodos()

        #expect(list == [Periodo("2026-09")!, Periodo("2026-07")!, Periodo("2025-12")!])
    }

    @Test func aRejectedSessionNotifiesOnceWithTheTokenThatWasSent() async {
        let counter = ExpiryCounterBox()
        let transport = FakeTransport.json(#"{"message":"x","code":"SESION_INVALIDA"}"#, status: .unauthorized)
        let api = OpenAPIMirachAPI(
            serverURL: serverURL, transport: transport,
            currentToken: { "tok-sent" }, onSessionExpired: { counter.fire($0) }
        )

        await #expect(throws: APIError.sessionExpired) { _ = try await api.resumen(periodo: nil) }
        await #expect(throws: APIError.sessionExpired) { _ = try await api.periodos() }

        #expect(counter.tokens == ["tok-sent", "tok-sent"])
    }

    @Test func aRejectedClientKeyIsNotASessionExpiry() async {
        let counter = ExpiryCounterBox()
        let transport = FakeTransport.json(#"{"message":"x","code":"API_KEY_INVALIDA"}"#, status: .unauthorized)
        let api = OpenAPIMirachAPI(
            serverURL: serverURL, transport: transport,
            currentToken: { "tok-sent" }, onSessionExpired: { counter.fire($0) }
        )

        await #expect(throws: APIError.apiKeyRejected) { _ = try await api.resumen(periodo: nil) }

        #expect(counter.tokens.isEmpty)
    }

    @Test func serverErrorsAreBadStatus() async {
        await #expect(throws: APIError.badStatus(503)) {
            _ = try await api(.json("{}", status: .serviceUnavailable)).resumen(periodo: nil)
        }
        await #expect(throws: APIError.badStatus(400)) {
            _ = try await api(.json("{}", status: .badRequest)).resumen(periodo: Periodo("2026-07"))
        }
    }
}

private final class ExpiryCounterBox: @unchecked Sendable {
    private let lock = NSLock()
    private var _tokens: [String] = []
    func fire(_ token: String) { lock.withLock { _tokens.append(token) } }
    var tokens: [String] { lock.withLock { _tokens } }
}
