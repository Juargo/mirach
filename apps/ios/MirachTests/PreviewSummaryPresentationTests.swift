import Foundation
import Testing
@testable import Mirach

/// Screen 04's classification accordion: pure presentation over `CartolaPreview.clasificacion`.
struct PreviewSummaryPresentationTests {
    private let preview = SampleData.preview

    // MARK: rows of a category

    @Test func theRowsOfACategoryAreLookedUpByRowIndexInOrder() {
        let category = ClasificacionPreview.Categoria(
            categoriaId: "c", nombre: "X", cantidad: 2, total: 1, filas: [3, 1]
        )

        let rows = PreviewSummaryPresentation.rows(of: category, in: preview)

        #expect(rows.map(\.rowIndex) == [1, 3])
    }

    @Test func aRowIndexThePreviewDoesNotHaveIsSkipped() {
        let category = ClasificacionPreview.Categoria(
            categoriaId: "c", nombre: "X", cantidad: 2, total: 1, filas: [0, 99]
        )

        #expect(PreviewSummaryPresentation.rows(of: category, in: preview).map(\.rowIndex) == [0])
    }

    @Test func theIncomeRowsAreTheNonDuplicateRowsWithAbonoOnly() {
        #expect(PreviewSummaryPresentation.incomeRows(in: preview).map(\.rowIndex) == [5])
    }

    // MARK: the unknowns line and the button order

    @Test func zeroUnknownsSaysEverythingWasClassifiedAndKeepsUploadAsPrimary() {
        let classification = ClasificacionPreview(ingresos: .init(cantidad: 0, total: 0), buckets: [], desconocidos: 0)

        #expect(PreviewSummaryPresentation.unknownsMessage(classification) == "Todos los movimientos quedaron clasificados.")
        #expect(PreviewSummaryPresentation.reviewIsPrimary(classification) == false)
    }

    @Test func oneUnknownIsSingularAndMakesReviewPrimary() {
        let classification = ClasificacionPreview(ingresos: .init(cantidad: 0, total: 0), buckets: [], desconocidos: 1)

        #expect(PreviewSummaryPresentation.unknownsMessage(classification) == "1 movimiento quedó en Desconocido")
        #expect(PreviewSummaryPresentation.reviewIsPrimary(classification) == true)
    }

    @Test func severalUnknownsArePlural() {
        let classification = ClasificacionPreview(ingresos: .init(cantidad: 0, total: 0), buckets: [], desconocidos: 3)

        #expect(PreviewSummaryPresentation.unknownsMessage(classification) == "3 movimientos quedaron en Desconocido")
    }

    // MARK: counts and titles

    @Test func countsReadAsMovements() {
        #expect(PreviewSummaryPresentation.countText(1) == "1 movimiento")
        #expect(PreviewSummaryPresentation.countText(4) == "4 movimientos")
    }

    @Test func aBucketGroupIsNamedWithTheProductLabel() {
        let group = ClasificacionPreview.BucketGroup(bucket: .deseos, cantidad: 2, total: 28_490, categorias: [])

        #expect(PreviewSummaryPresentation.title(of: group) == "Gustos")
        #expect(PreviewSummaryPresentation.spokenSummary(of: group) == "Gustos. 2 movimientos. Gasto de $28.490")
    }

    @Test func theIncomeHeaderSpeaksItsTotal() {
        let ingresos = ClasificacionPreview.Ingresos(cantidad: 1, total: 1_200_000)

        #expect(PreviewSummaryPresentation.spokenSummary(of: ingresos) == "Ingresos. 1 movimiento. Ingreso de $1.200.000")
    }
}
