import Foundation
import Testing
@testable import Mirach

/// Income rows (`abono > 0 && cargo == 0`) are always imported as «Ingreso» by the server, which
/// ignores any edit for them: the review must not offer one (`SampleData.rows[5]` is an income).
@MainActor
struct IncomeRowsReviewTests {
    private let xlsx = URL(fileURLWithPath: "/picked/cartola.xlsx")
    private let catalog: CatalogoCategorias? = SampleData.catalog

    private func reviewing(_ api: FakeMirachAPI = FakeMirachAPI()) async -> (SubirCartolaViewModel, FakeMirachAPI) {
        let viewModel = SubirCartolaViewModel(api: api, staging: FakeCartolaStaging())
        await viewModel.chooseFile(xlsx)
        viewModel.startReview()
        return (viewModel, api)
    }

    // MARK: presentation

    @Test func anIncomeRowHasItsOwnSectionBeforeTheLoadedOnesNeverDeseosDesconocido() {
        let sections = ReviewPresentation.sections(rows: SampleData.rows, edits: [:], catalog: catalog)

        #expect(sections.map(\.title) == [
            "Necesidades · Supermercado", "Deseos · Desconocido", "Deseos · Restaurantes", "Ingreso", "Ya cargados",
        ])
        #expect(sections.first { $0.title == "Deseos · Desconocido" }?.rows.map(\.rowIndex) == [2, 3])
        #expect(sections.first { $0.title == "Ingreso" }?.rows.map(\.rowIndex) == [5])
    }

    @Test func aLoadedIncomeStaysInTheLoadedSection() {
        let loaded = CartolaRow(
            rowIndex: 7, fecha: SampleData.date(day: 0), descripcion: "ABONO", cargo: 0, abono: 5_000,
            esDuplicado: true, sugerido: nil
        )

        let sections = ReviewPresentation.sections(rows: [loaded], edits: [:], catalog: catalog)

        #expect(sections.map(\.title) == ["Ya cargados"])
    }

    @Test func onlyAPositiveCreditWithNoDebitIsAnIncome() {
        func row(cargo: Int, abono: Int) -> CartolaRow {
            CartolaRow(
                rowIndex: 1, fecha: SampleData.date(day: 0), descripcion: "X", cargo: cargo, abono: abono,
                esDuplicado: false, sugerido: nil
            )
        }
        #expect(row(cargo: 0, abono: 10).esIngreso)
        #expect(!row(cargo: 10, abono: 0).esIngreso)
        #expect(!row(cargo: 10, abono: 10).esIngreso)
        #expect(!row(cargo: 0, abono: 0).esIngreso)
    }

    // MARK: edits

    @Test func anIncomeRowIsNotEditable() async {
        let (viewModel, _) = await reviewing()

        viewModel.choose(SampleData.Cat.fondo, forRow: 5)

        #expect(viewModel.edits.isEmpty)
    }

    @Test func anIncomeIsNeverInTheEditsThatAreSent() async {
        let (viewModel, api) = await reviewing()
        viewModel.choose(SampleData.Cat.fondo, forRow: 2)
        viewModel.choose(SampleData.Cat.fondo, forRow: 5)

        await viewModel.confirm()

        #expect(api.commitCalls.first?.edits.map { $0.map(\.rowIndex) } == [2])
    }

    @Test func aCategoryCannotBeCreatedFromAnIncomeRow() async {
        let (viewModel, api) = await reviewing()

        await viewModel.createCategory(NuevaCategoria(nombre: "Amigos", bucket: .deseos, patron: nil), forRow: 5)

        #expect(api.crearCategoriaCalls.isEmpty)
        #expect(viewModel.edits.isEmpty)
    }

    @Test func reloadingThePreviewDropsAnEditForARowThatIsNowAnIncome() async {
        let api = FakeMirachAPI()
        let nowIncome = SampleData.rows.map { row in
            row.rowIndex == 2
                ? CartolaRow(
                    rowIndex: 2, fecha: row.fecha, descripcion: row.descripcion, cargo: 0, abono: 40_000,
                    esDuplicado: false, sugerido: nil
                )
                : row
        }
        let reloaded = CartolaPreview(
            banco: "Banco de Chile", tipoCuenta: "Cuenta Corriente", numeroCuenta: "00-123-45678-09",
            totalFilas: 5, duplicados: 1, nuevas: 4, filas: nowIncome
        )
        api.setPreviewResults([.success(SampleData.preview), .success(reloaded)])
        api.setCrearCategoriaResults([.success(CategoriaCatalogo(id: "cat-new", nombre: "Amigos", bucket: .deseos))])
        let (viewModel, _) = await reviewing(api)
        viewModel.choose(SampleData.Cat.fondo, forRow: 2)
        #expect(viewModel.edits.keys.sorted() == [2])

        await viewModel.createCategory(NuevaCategoria(nombre: "Amigos", bucket: .deseos, patron: nil), forRow: 1)

        #expect(viewModel.edits.keys.sorted() == [1], "row 2 is an income now: its edit must go")
    }

    @Test func theNoticeCountNeverIncludesIncomeRows() {
        let before = SampleData.rows
        let after = SampleData.rows.map { row in
            CartolaRow(
                rowIndex: row.rowIndex, fecha: row.fecha, descripcion: row.descripcion, cargo: row.cargo,
                abono: row.abono, esDuplicado: row.esDuplicado, sugerido: .init(bucket: .deseos, categoriaId: "cat-new")
            )
        }

        let n = SubirCartolaViewModel.newMatches(
            before: before, after: after, categoryID: "cat-new", fromRow: 2, edits: [:]
        )

        // Rows 0, 1 and 3 count; 2 is the origin; 4 is a duplicate; 5 is an income.
        #expect(n == 3)
    }
}
