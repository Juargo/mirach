import Foundation
import Testing
@testable import Mirach

struct ReviewPresentationTests {
    private let catalog: CatalogoCategorias? = SampleData.catalog
    private func classify(_ index: Int, edit: String? = nil, in catalog: CatalogoCategorias? = SampleData.catalog) -> String {
        ReviewPresentation.classification(of: SampleData.rows[index], edit: edit, catalog: catalog).text
    }

    // MARK: classification

    @Test func aSuggestedIdIsResolvedAgainstTheCatalog() {
        #expect(classify(0) == "Necesidades · Supermercado")
        #expect(classify(1) == "Deseos · Restaurantes")
    }

    @Test func noSuggestionMeansDeseosDesconocido() {
        #expect(classify(2) == "Deseos · Desconocido")
    }

    @Test func aBucketWithoutCategoryReadsDesconocidoInThatBucket() {
        let row = CartolaRow(
            rowIndex: 9, fecha: SampleData.date(day: 0), descripcion: "X", cargo: 1, abono: 0,
            esDuplicado: false, sugerido: .init(bucket: .ahorro, categoriaId: nil)
        )

        let text = ReviewPresentation.classification(of: row, edit: nil, catalog: catalog).text

        #expect(text == "Ahorro · Desconocido")
    }

    @Test func anIdTheCatalogDoesNotKnowKeepsTheSuggestedBucketWithAnHonestName() {
        let row = CartolaRow(
            rowIndex: 9, fecha: SampleData.date(day: 0), descripcion: "X", cargo: 1, abono: 0,
            esDuplicado: false, sugerido: .init(bucket: .necesidades, categoriaId: "gone")
        )

        #expect(ReviewPresentation.classification(of: row, edit: nil, catalog: catalog).text == "Necesidades · Otra categoría")
    }

    @Test func anEditOverridesTheSuggestion() {
        #expect(classify(0, edit: SampleData.Cat.fondo) == "Ahorro · Fondo de emergencia")
        #expect(classify(2, edit: SampleData.Cat.transporte) == "Necesidades · Transporte")
    }

    @Test func noBucketIsEverCalledGustos() {
        let all = Bucket.allCases.map(\.label) + SampleData.rows.indices.map { classify($0) }
        #expect(all.allSatisfy { !$0.localizedCaseInsensitiveContains("gustos") })
    }

    // MARK: sections

    @Test func rowsAreGroupedByBucketThenCategoryWithDuplicatesLast() {
        let sections = ReviewPresentation.sections(rows: SampleData.rows, edits: [:], catalog: catalog)

        #expect(sections.map(\.title) == [
            "Necesidades · Supermercado", "Deseos · Desconocido", "Deseos · Restaurantes", "Ya cargados",
        ])
        #expect(sections.map { $0.rows.map(\.rowIndex) } == [[0], [2, 3], [1], [4]])
        #expect(sections.map(\.bucket) == [.necesidades, .deseos, .deseos, nil])
    }

    @Test func anEditMovesTheRowToItsNewGroup() {
        let sections = ReviewPresentation.sections(
            rows: SampleData.rows, edits: [2: SampleData.Cat.fondo], catalog: catalog
        )

        #expect(sections.map(\.title) == [
            "Necesidades · Supermercado", "Deseos · Desconocido", "Deseos · Restaurantes",
            "Ahorro · Fondo de emergencia", "Ya cargados",
        ])
        #expect(sections.first { $0.title == "Ahorro · Fondo de emergencia" }?.rows.map(\.rowIndex) == [2])
    }

    @Test func aStatementWithoutDuplicatesHasNoDuplicatesSection() {
        let rows = SampleData.rows.filter { !$0.esDuplicado }

        let sections = ReviewPresentation.sections(rows: rows, edits: [:], catalog: catalog)

        #expect(!sections.contains { $0.title == "Ya cargados" })
    }

    // MARK: money and date

    @Test func anExpenseAndAnIncomeReadWithTheirSign() {
        #expect(SampleData.rows[0].amountText == "-$25.990")
        #expect(SampleData.rows[3].amountText == "+$1.200.000")
        #expect(SampleData.rows[0].spokenAmount == "Gasto de $25.990")
        #expect(SampleData.rows[3].spokenAmount == "Ingreso de $1.200.000")
    }

    @Test func theShortDateIsReadInUTCAndIndependentOfTheDevice() {
        #expect(Format.shortDate(SampleData.date(day: 0)) == "3 oct")
        #expect(Format.shortDate(Date(timeIntervalSince1970: 1_798_675_200)) == "31 dic")
        #expect(Format.shortDate(Date(timeIntervalSince1970: 1_767_225_600)) == "1 ene")
    }
}
