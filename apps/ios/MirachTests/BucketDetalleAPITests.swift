import Foundation
import HTTPTypes
import Testing
@testable import Mirach

struct BucketDetalleAPITests {
    private let serverURL = URL(string: "https://example.test")!

    private func api(_ transport: FakeTransport) -> OpenAPIMirachAPI {
        OpenAPIMirachAPI(serverURL: serverURL, transport: transport)
    }

    private func group(
        id: String? = #""cat-1""#, nombre: String = "Restaurantes", icono: String = #""utensils""#,
        subtotal: String = "210900", moves: String
    ) -> String {
        #"{"categoriaId":\#(id ?? "null"),"nombre":"\#(nombre)","icono":\#(icono),"subtotal":"\#(subtotal)","conteo":2,"transacciones":[\#(moves)]}"#
    }

    private func move(id: String = "t-1", fecha: String = "2026-09-02T00:00:00.000Z", monto: String = "118500") -> String {
        #"{"id":"\#(id)","fecha":"\#(fecha)","descripcion":"RESTAURANT LA PUNTA","origen":"Banco de Chile","monto":"\#(monto)"}"#
    }

    private func body(
        bucket: String = "Deseos", periodo: String = "2026-09", total: String = "610400",
        porcentajeBp: String = "3300", metaBp: String = "3000", groups: [String]? = nil
    ) -> String {
        let list = (groups ?? [group(moves: move())]).joined(separator: ",")
        return #"{"periodo":"\#(periodo)","bucket":"\#(bucket)","total":"\#(total)","totalTransacciones":1,"totalCategorias":1,"porcentajeBp":\#(porcentajeBp),"metaBp":\#(metaBp),"grupos":[\#(list)]}"#
    }

    @Test func mapsTheHeaderGroupsAndMovementsWithExactMoney() async throws {
        let detalle = try await api(.json(body())).bucketDetalle(bucket: .deseos, periodo: Periodo("2026-09")!)

        #expect(detalle.bucket == .deseos)
        #expect(detalle.periodo == Periodo("2026-09"))
        #expect(detalle.total == 610_400)
        #expect(detalle.porcentajeBp == 3300)
        #expect(detalle.metaBp == 3000)
        #expect(detalle.totalTransacciones == 1)
        #expect(detalle.totalCategorias == 1)
        let group = try #require(detalle.grupos.first)
        #expect(group.categoriaId == "cat-1")
        #expect(group.nombre == "Restaurantes")
        #expect(group.icono == "utensils")
        #expect(group.subtotal == 210_900)
        let movement = try #require(group.transacciones.first)
        #expect(movement.id == "t-1")
        #expect(movement.descripcion == "RESTAURANT LA PUNTA")
        #expect(movement.origen == "Banco de Chile")
        #expect(movement.monto == 118_500)
        #expect(movement.fecha == Date(timeIntervalSince1970: 1_788_307_200))
    }

    @Test func keepsMoneyBeyondDoublePrecisionAndNegativeRefunds() async throws {
        let detalle = try await api(.json(body(
            total: "9007199254740993",
            groups: [group(subtotal: "9007199254740993", moves: move(monto: "9007199254740995") + "," + move(id: "t-2", monto: "-2"))]
        ))).bucketDetalle(bucket: .deseos, periodo: Periodo("2026-09")!)

        #expect(detalle.total == 9_007_199_254_740_993)
        #expect(detalle.grupos[0].transacciones.map(\.monto) == [9_007_199_254_740_995, -2])
    }

    @Test func aNullIconAndANullCategoryAreKeptAsNil() async throws {
        let detalle = try await api(.json(body(groups: [
            group(id: nil, nombre: "Sin categoría", icono: "null", moves: move()),
        ]))).bucketDetalle(bucket: .deseos, periodo: Periodo("2026-09")!)

        #expect(detalle.grupos[0].categoriaId == nil)
        #expect(detalle.grupos[0].icono == nil)
        #expect(detalle.grupos[0].id == "sin-categoria")
    }

    @Test func aMissingPercentageAndTargetStayNil() async throws {
        let detalle = try await api(.json(body(porcentajeBp: "null", metaBp: "null")))
            .bucketDetalle(bucket: .deseos, periodo: Periodo("2026-09")!)

        #expect(detalle.porcentajeBp == nil)
        #expect(detalle.metaBp == nil)
    }

    @Test func keepsTheGroupsAndMovementsInTheOrderTheServerSent() async throws {
        let detalle = try await api(.json(body(groups: [
            group(id: #""b""#, nombre: "Zeta", moves: move(id: "t-9") + "," + move(id: "t-1")),
            group(id: #""a""#, nombre: "Alfa", moves: move(id: "t-5")),
        ]))).bucketDetalle(bucket: .deseos, periodo: Periodo("2026-09")!)

        #expect(detalle.grupos.map(\.nombre) == ["Zeta", "Alfa"])
        #expect(detalle.grupos[0].transacciones.map(\.id) == ["t-9", "t-1"])
    }

    @Test func anEmptyMonthHasNoGroups() async throws {
        let detalle = try await api(.json(body(total: "0", porcentajeBp: "null", groups: [])))
            .bucketDetalle(bucket: .deseos, periodo: Periodo("2026-09")!)

        #expect(detalle.grupos.isEmpty)
    }

    @Test func rejectsBodiesTheAppCannotTrust() async {
        let broken = [
            body(bucket: "Ingresos"),
            body(periodo: "2026-13"),
            body(total: "12,5"),
            body(groups: [group(subtotal: "1.5", moves: move())]),
            body(groups: [group(moves: move(monto: "oops"))]),
            body(groups: [group(moves: move(fecha: "ayer"))]),
        ]
        for text in broken {
            await #expect(throws: DecodingError.self) {
                _ = try await api(.json(text)).bucketDetalle(bucket: .deseos, periodo: Periodo("2026-09")!)
            }
        }
    }

    @Test func asksForTheBucketAndMonthByTheirApiNames() async throws {
        let transport = FakeTransport.json(body())

        _ = try await api(transport).bucketDetalle(bucket: .deseos, periodo: Periodo("2026-09")!)
        _ = try await api(transport).bucketDetalle(bucket: .necesidades, periodo: Periodo("2026-07")!)

        #expect(transport.requests.map(\.path) == [
            "/api/buckets/Deseos/detalle?periodo=2026-09", "/api/buckets/Necesidades/detalle?periodo=2026-07",
        ])
    }

    @Test func aRejectedSessionOnTheDetailNotifiesWithTheTokenSent() async {
        let seen = TokenBox()
        let transport = FakeTransport.json(#"{"message":"x","code":"SESION_INVALIDA"}"#, status: .unauthorized)
        let api = OpenAPIMirachAPI(
            serverURL: serverURL, transport: transport,
            currentToken: { "tok-sent" }, onSessionExpired: { seen.add($0) }
        )

        await #expect(throws: APIError.sessionExpired) {
            _ = try await api.bucketDetalle(bucket: .deseos, periodo: Periodo("2026-09")!)
        }
        await #expect(throws: APIError.sessionExpired) {
            _ = try await api.reclasificar(transaccionId: "t-1", categoriaId: "c-1")
        }

        #expect(seen.tokens == ["tok-sent", "tok-sent"])
    }

    @Test func aServerErrorOnTheDetailIsABadStatus() async {
        await #expect(throws: APIError.badStatus(503)) {
            _ = try await api(.json("{}", status: .serviceUnavailable))
                .bucketDetalle(bucket: .deseos, periodo: Periodo("2026-09")!)
        }
    }

    // MARK: reclassify

    @Test func reclassifySendsTheCategoryIdAndMapsTheAnswer() async throws {
        let transport = FakeTransport.json(#"{"id":"t-1","categoria":{"id":"cat-ropa","nombre":"Ropa"},"bucket":"Deseos"}"#)

        let result = try await api(transport).reclasificar(transaccionId: "t-1", categoriaId: "cat-ropa")

        #expect(result == Reclasificacion(categoriaId: "cat-ropa", categoriaNombre: "Ropa", bucket: .deseos))
        #expect(transport.requests.map(\.method) == [.patch])
        #expect(transport.requests.map(\.path) == ["/api/transacciones/t-1/categoria"])
        // Exactly the id, never a name.
        let sent = try JSONSerialization.jsonObject(with: Data(try #require(transport.bodies.first).utf8)) as? [String: String]
        #expect(sent == ["categoriaId": "cat-ropa"])
    }

    @Test func aMovementIdWithSpecialCharactersIsEscapedInThePath() async throws {
        let transport = FakeTransport.json(#"{"id":"a/b","categoria":{"id":"c","nombre":"C"},"bucket":"Ahorro"}"#)

        _ = try await api(transport).reclasificar(transaccionId: "a/b", categoriaId: "c")

        #expect(transport.requests.map(\.path) == ["/api/transacciones/a%2Fb/categoria"])
    }

    @Test func reclassifyMapsTheCatalogsFailures() async {
        await #expect(throws: ReclasificarError.categoryNotFound) {
            _ = try await api(.json("{}", status: .badRequest)).reclasificar(transaccionId: "t", categoriaId: "c")
        }
        await #expect(throws: ReclasificarError.movementNotFound) {
            _ = try await api(.json("{}", status: .notFound)).reclasificar(transaccionId: "t", categoriaId: "c")
        }
        await #expect(throws: APIError.badStatus(500)) {
            _ = try await api(.json("{}", status: .internalServerError)).reclasificar(transaccionId: "t", categoriaId: "c")
        }
    }

    @Test func reclassifyRefusesAnAnswerInABucketTheAppDoesNotKnow() async {
        let transport = FakeTransport.json(#"{"id":"t-1","categoria":{"id":"c","nombre":"C"},"bucket":"Otros"}"#)

        await #expect(throws: DecodingError.self) {
            _ = try await api(transport).reclasificar(transaccionId: "t-1", categoriaId: "c")
        }
    }
}

private final class TokenBox: @unchecked Sendable {
    private let lock = NSLock()
    private var _tokens: [String] = []
    func add(_ token: String) { lock.withLock { _tokens.append(token) } }
    var tokens: [String] { lock.withLock { _tokens } }
}
