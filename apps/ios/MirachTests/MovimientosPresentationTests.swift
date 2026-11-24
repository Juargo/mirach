import Foundation
import Testing
@testable import Mirach

struct MovimientosPresentationTests {
    private func detalle(total: Int, bp: Int?) -> BucketDetalle {
        BucketDetalle(
            bucket: .necesidades, periodo: Periodo("2026-09")!, total: total, porcentajeBp: bp, metaBp: 5000,
            totalTransacciones: 0, totalCategorias: 0, grupos: []
        )
    }

    @Test func theHeaderIsTheTotalAndThePercentageAsTheAPISendsThem() {
        #expect(MovimientosPresentation.paneHeader(detalle(total: 569_400, bp: 5200)) == "$569.400 · 52%")
        #expect(MovimientosPresentation.paneHeader(detalle(total: 1_234_567, bp: 3050)) == "$1.234.567 · 30,5%")
    }

    @Test func aMissingPercentageIsAnEmDash() {
        #expect(MovimientosPresentation.paneHeader(detalle(total: 0, bp: nil)) == "$0 · —")
    }

    @Test func theNoticeNamesTheBucketAsGustosNeverDeseosAndTheCategory() {
        let result = Reclasificacion(categoriaId: "c", categoriaNombre: "Ropa", bucket: .deseos)
        #expect(MovimientosPresentation.moved(result) == "Movido a Gustos · Ropa")
    }

    @Test func aFailedUndoSaysSoAndOffersNothingElse() {
        #expect(MovimientosPresentation.undoFailed(connection: false) == "No pudimos deshacer el movimiento. Inténtalo de nuevo.")
        #expect(MovimientosPresentation.undoFailed(connection: true)
            == "No pudimos deshacer el movimiento. Revisa tu conexión e inténtalo de nuevo.")
    }

    @Test func theFixedCopyIsTheSpecs() {
        #expect(MovimientosPresentation.loading == "Cargando movimientos…")
        #expect(MovimientosPresentation.emptyPane == "Sin movimientos")
        #expect(MovimientosPresentation.move == "Mover")
        #expect(MovimientosPresentation.undo == "Deshacer")
    }

    @Test func aMovementIsReadWithItsFullDescriptionDateAndAmount() {
        let movement = MovimientoBucket(
            id: "t", fecha: Date(timeIntervalSince1970: 1_790_985_600), descripcion: "NETFLIX.COM", origen: "Manual", monto: 15_480
        )
        #expect(MovimientosPresentation.rowLabel(movement) == "NETFLIX.COM. 3 oct. Gasto de $15.480")
    }
}
