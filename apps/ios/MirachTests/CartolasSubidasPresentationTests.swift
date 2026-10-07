import Foundation
import Testing
@testable import Mirach

struct CartolasSubidasPresentationTests {
    private let processed = SampleData.cartolas[0]
    private let failed = SampleData.cartolas[1]
    private let single = SampleData.cartolas[2]

    @Test func anUnresolvedBankReadsAsNotIdentified() {
        #expect(CartolasPresentation.banco(failed) == "Banco no identificado")
        #expect(CartolasPresentation.banco(processed) == "Banco de Chile")
    }

    @Test func theStatusIsAWordNeverOnlyAColor() {
        #expect(CartolasPresentation.estado(processed) == "Procesada")
        #expect(CartolasPresentation.estado(failed) == "Fallida")
    }

    @Test func countsMovementsInTheSingularToo() {
        #expect(CartolasPresentation.movimientos(processed) == "37 movimientos")
        #expect(CartolasPresentation.movimientos(single) == "1 movimiento")
        #expect(CartolasPresentation.movimientos(failed) == nil, "a failed import has no movements to count")
    }

    @Test func confirmationNamesTheConsequenceOfDeletingAProcessedImport() {
        #expect(
            CartolasPresentation.confirmation(processed)
                == "Se eliminarán 37 movimientos de Banco de Chile (3 oct). Esta acción no se puede deshacer."
        )
        #expect(
            CartolasPresentation.confirmation(single)
                == "Se eliminará 1 movimiento de BancoEstado (2 sep). Esta acción no se puede deshacer."
        )
    }

    @Test func confirmationForAFailedImportDoesNotPromiseMovements() {
        #expect(
            CartolasPresentation.confirmation(failed)
                == "Se eliminará esta cartola fallida de Banco no identificado (2 oct)."
        )
    }

    @Test func voiceOverReadsBankFileDateStatusAndCountOrReason() {
        #expect(
            CartolasPresentation.rowLabel(processed)
                == "Banco de Chile. cartola-septiembre.xlsx. 3 oct. Procesada. 37 movimientos"
        )
        #expect(
            CartolasPresentation.rowLabel(failed)
                == "Banco no identificado. estado-de-cuenta.pdf. 2 oct. Fallida. "
                + "Motivo: No se reconoció el formato del archivo"
        )
    }

    @Test func aFailedImportWithoutAReasonStillReadsAsFailed() {
        let bare = CartolaSubida(
            id: "g-9", banco: nil, nombreArchivo: "x.pdf", estado: .fallida, motivoFallo: nil,
            fecha: failed.fecha, totalTransacciones: 0
        )
        #expect(CartolasPresentation.rowLabel(bare) == "Banco no identificado. x.pdf. 2 oct. Fallida")
    }
}
