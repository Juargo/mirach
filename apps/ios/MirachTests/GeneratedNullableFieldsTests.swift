import Foundation
import Testing
@testable import Mirach

/// Guards the OpenAPI form the Swift client generator needs: nullable fields
/// must survive generation instead of being dropped (see README, "API client").
struct GeneratedNullableFieldsTests {
    private func summaryJSON(
        estadoGlobal: String, estadoSemaforo: String, porcentajeBp: String,
        estado: String = "null", estadoMes: String = "null"
    ) -> Data {
        Data("""
        {"periodo":"2026-09","totalIngreso":"1000000","sinIngreso":false,
         "buckets":[{"bucket":"Necesidades","total":"500000","porcentajeBp":\(porcentajeBp),
                     "participacionGastoBp":10000,"metaBp":5000,"estadoSemaforo":\(estadoSemaforo),"estado":\(estado)}],
         "targets":{"Necesidades":50,"Deseos":30,"Ahorro":20},
         "estadoGlobal":\(estadoGlobal),"estadoMes":\(estadoMes),"bloquesEstadoMes":[]}
        """.utf8)
    }

    @Test func decodesNullNullableSummaryFields() throws {
        let data = summaryJSON(estadoGlobal: "null", estadoSemaforo: "null", porcentajeBp: "null")

        let summary = try JSONDecoder().decode(Components.Schemas.ResumenMesResponse.self, from: data)

        #expect(summary.estadoGlobal == nil)
        #expect(summary.estadoMes == nil)
        #expect(summary.buckets.first?.estadoSemaforo == nil)
        #expect(summary.buckets.first?.estado == nil)
        #expect(summary.buckets.first?.porcentajeBp == nil)
    }

    @Test func decodesPresentNullableSummaryFields() throws {
        let data = summaryJSON(
            estadoGlobal: "\"rojo\"", estadoSemaforo: "\"verde\"", porcentajeBp: "5000",
            estado: "\"cerca\"", estadoMes: "\"sobre\""
        )

        let summary = try JSONDecoder().decode(Components.Schemas.ResumenMesResponse.self, from: data)

        #expect(summary.estadoGlobal == .rojo)
        #expect(summary.estadoMes == .sobre)
        #expect(summary.buckets.first?.estadoSemaforo == .verde)
        #expect(summary.buckets.first?.estado == .cerca)
        #expect(summary.buckets.first?.porcentajeBp == 5000)
    }
}
