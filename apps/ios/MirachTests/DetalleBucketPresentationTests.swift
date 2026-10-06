import Testing
@testable import Mirach

struct DetalleBucketPresentationTests {
    @Test func countsUseTheSingularForOne() {
        #expect(DetalleBucketPresentation.movements(1) == "1 movimiento")
        #expect(DetalleBucketPresentation.movements(0) == "0 movimientos")
        #expect(DetalleBucketPresentation.categories(1) == "1 categoría")
        #expect(DetalleBucketPresentation.categories(3) == "3 categorías")
    }

    @Test func theHeaderIsReadWithTheSpendSignAndTheTarget() {
        #expect(DetalleBucketPresentation.headerLabel(SampleData.deseosDetalle)
            == "Deseos. Gasto de $610.400. 33% del ingreso. Meta 30%. 4 movimientos. 3 categorías")
    }

    @Test func aMissingPercentageAndTargetAreSaidOrLeftOut() {
        let detalle = BucketDetalle(
            bucket: .ahorro, periodo: Periodo("2026-09")!, total: 0, porcentajeBp: nil, metaBp: nil,
            totalTransacciones: 0, totalCategorias: 0, grupos: []
        )
        #expect(DetalleBucketPresentation.headerLabel(detalle)
            == "Ahorro. Sin gasto. sin porcentaje del ingreso. 0 movimientos. 0 categorías")
    }

    @Test func aRefundInsideTheBucketIsNotReadAsSpend() {
        let refund = MovimientoBucket(id: "t", fecha: SampleData.date(day: 0), descripcion: "DEVOLUCION", origen: "Manual", monto: -5_000)
        #expect(DetalleBucketPresentation.rowLabel(refund) == "DEVOLUCION. Reembolso neto de $5.000. 3 oct. Manual")
    }

    @Test func aRowIsReadWithDescriptionAmountDateAndOrigin() {
        let row = SampleData.deseosDetalle.grupos[0].transacciones[0]
        #expect(DetalleBucketPresentation.rowLabel(row) == "RESTAURANT LA PUNTA. Gasto de $118.500. 3 oct. Banco de Chile")
    }

    @Test func aGroupIsReadWithItsCountAndSubtotal() {
        #expect(DetalleBucketPresentation.groupLabel(SampleData.deseosDetalle.grupos[0])
            == "Restaurantes. 2 movimientos. Gasto de $210.900")
    }

    @Test func theBucketChangeMessageNamesBothBucketsWithTheOfficialLabels() {
        let text = DetalleBucketPresentation.bucketChangeMessage(from: .deseos, to: .necesidades)
        #expect(text == "Este movimiento pasará de Deseos a Necesidades y cambiará el cálculo del mes.")
    }
}
