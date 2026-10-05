import Foundation
import Testing
@testable import Mirach

/// Guards the OpenAPI form the Swift client generator needs: nullable fields
/// must survive generation instead of being dropped (see README, "API client").
struct GeneratedNullableFieldsTests {
    private func summaryJSON(estadoGlobal: String, estadoSemaforo: String, porcentajeBp: String) -> Data {
        Data("""
        {"periodo":"2026-09","totalIngreso":"1000000","sinIngreso":false,
         "buckets":[{"bucket":"Necesidades","total":"500000","porcentajeBp":\(porcentajeBp),
                     "participacionGastoBp":10000,"estadoSemaforo":\(estadoSemaforo)}],
         "targets":{"Necesidades":50,"Deseos":30,"Ahorro":20},
         "estadoGlobal":\(estadoGlobal)}
        """.utf8)
    }

    @Test func decodesNullNullableSummaryFields() throws {
        let data = summaryJSON(estadoGlobal: "null", estadoSemaforo: "null", porcentajeBp: "null")

        let summary = try JSONDecoder().decode(Components.Schemas.ResumenMesResponse.self, from: data)

        #expect(summary.estadoGlobal == nil)
        #expect(summary.buckets.first?.estadoSemaforo == nil)
        #expect(summary.buckets.first?.porcentajeBp == nil)
    }

    @Test func decodesPresentNullableSummaryFields() throws {
        let data = summaryJSON(estadoGlobal: "\"rojo\"", estadoSemaforo: "\"verde\"", porcentajeBp: "5000")

        let summary = try JSONDecoder().decode(Components.Schemas.ResumenMesResponse.self, from: data)

        #expect(summary.estadoGlobal == .rojo)
        #expect(summary.buckets.first?.estadoSemaforo == .verde)
        #expect(summary.buckets.first?.porcentajeBp == 5000)
    }
}
