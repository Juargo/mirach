import Foundation
import HTTPTypes
import Testing
@testable import Mirach

/// `GET` and `PUT /api/perfil/presupuesto` through the real generated client and a fake transport.
struct PerfilPresupuestoAPITests {
    private let serverURL = URL(string: "https://example.test")!

    private final class Expiry: @unchecked Sendable {
        private let lock = NSLock()
        private var _tokens: [String] = []
        func fire(_ token: String) { lock.withLock { _tokens.append(token) } }
        var tokens: [String] { lock.withLock { _tokens } }
    }

    private func makeAPI(_ transport: FakeTransport, expiry: Expiry = Expiry()) -> OpenAPIMirachAPI {
        OpenAPIMirachAPI(
            serverURL: serverURL, transport: transport,
            currentToken: { "tok-sent" }, onSessionExpired: { expiry.fire($0) }
        )
    }

    private func body(perfil: String) -> String {
        #"{"perfil":"\#(perfil)","metas":{"Necesidades":50,"Deseos":30,"Ahorro":20},"diaCorte":1,"ingresoDeclarado":null}"#
    }

    @Test func getMapsEachPredefinedProfileAndPersonalizado() async throws {
        let expected: [(String, PerfilPresupuesto)] = [
            ("50_30_20", .predefinido(.p50_30_20)),
            ("65_20_15", .predefinido(.p65_20_15)),
            ("80_10_10", .predefinido(.p80_10_10)),
            ("90_5_5", .predefinido(.p90_5_5)),
            ("personalizado", .personalizado),
        ]
        for (id, perfil) in expected {
            let transport = FakeTransport.json(body(perfil: id))

            let result = try await makeAPI(transport).perfilPresupuesto()

            #expect(result == perfil)
            #expect(transport.requests.first?.method == .get)
            #expect(transport.requests.first?.path == "/api/perfil/presupuesto")
        }
    }

    @Test func getTreatsA401AsAnExpiredSessionAndNotifiesOnce() async {
        let expiry = Expiry()
        let transport = FakeTransport.json(#"{"message":"x","code":"SESION_INVALIDA"}"#, status: .unauthorized)

        await #expect(throws: APIError.sessionExpired) { _ = try await makeAPI(transport, expiry: expiry).perfilPresupuesto() }
        #expect(expiry.tokens == ["tok-sent"])
    }

    @Test func getTreatsOtherAnswersAsServerFailures() async {
        let transport = FakeTransport.json("{}", status: .serviceUnavailable)

        await #expect(throws: APIError.badStatus(503)) { _ = try await makeAPI(transport).perfilPresupuesto() }
    }

    @Test func putSendsOnlyThePerfilAndMapsTheStoredProfile() async throws {
        let transport = FakeTransport.json(body(perfil: "90_5_5"))

        let result = try await makeAPI(transport).guardarPerfilPresupuesto(.p90_5_5)

        #expect(result == .predefinido(.p90_5_5))
        #expect(transport.requests.first?.method == .put)
        #expect(transport.requests.first?.path == "/api/perfil/presupuesto")
        let sent = try #require(transport.bodies.first)
        let json = try #require(try JSONSerialization.jsonObject(with: Data(sent.utf8)) as? [String: String])
        #expect(json == ["perfil": "90_5_5"], "diaCorte and ingresoDeclarado are omitted so they stay unchanged")
    }

    @Test func putMapsA400AndA401() async {
        let rejected = FakeTransport.json(#"{"message":"x","code":"PERFIL_INVALIDO"}"#, status: .badRequest)
        await #expect(throws: APIError.badStatus(400)) { _ = try await makeAPI(rejected).guardarPerfilPresupuesto(.p50_30_20) }

        let expiry = Expiry()
        let unauthorized = FakeTransport.json(#"{"message":"x","code":"SESION_INVALIDA"}"#, status: .unauthorized)
        await #expect(throws: APIError.sessionExpired) {
            _ = try await makeAPI(unauthorized, expiry: expiry).guardarPerfilPresupuesto(.p50_30_20)
        }
        #expect(expiry.tokens == ["tok-sent"])
    }

    // MARK: existing behaviour that shares the touched code

    @Test func existingCallsKeepWorkingThroughTheStubAndTheDefaults() async throws {
        // The UI-test stub still serves the consent call and now also the profile.
        let stub = StubMirachAPI()
        #expect(try await stub.consentimientos() == Consentimientos(cartolasVigente: true))
        #expect(try await stub.perfilPresupuesto() == .predefinido(.p50_30_20))
        #expect(try await stub.guardarPerfilPresupuesto(.p65_20_15) == .predefinido(.p65_20_15))
    }
}
