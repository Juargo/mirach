import Foundation
import Testing
@testable import Mirach

/// What the screens that depend on the catalog do when a write elsewhere changes it: the review
/// of a statement, and the bucket detail with its category sheet.
@MainActor
struct CatalogChangeTests {
    private let xlsx = URL(fileURLWithPath: "/picked/cartola.xlsx")
    private let sept = Periodo("2026-09")!

    private var withoutSupermercado: CatalogoCategorias {
        CatalogoCategorias(categorias: SampleData.catalog.categorias.filter { $0.id != SampleData.Cat.supermercado })
    }

    private func reviewing(_ api: FakeMirachAPI) async -> SubirCartolaViewModel {
        let viewModel = SubirCartolaViewModel(api: api, staging: FakeCartolaStaging())
        await viewModel.chooseFile(xlsx)
        viewModel.startReview()
        return viewModel
    }

    // MARK: the review of a statement

    @Test func theReviewReadsTheCatalogAgainSoANewCategoryCanBeChosen() async {
        let api = FakeMirachAPI()
        let viewModel = await reviewing(api)
        let created = CategoriaCatalogo(id: "cat-new", nombre: "Mascotas", bucket: .deseos)
        api.setCategoriasResults([.success(CatalogoCategorias(categorias: SampleData.catalog.categorias + [created]))])

        await viewModel.catalogDidChange()

        #expect(api.categoriasCalls == 2)
        #expect(viewModel.loadedCatalog?.categoria(id: "cat-new") == created)
    }

    @Test func anEditNamingADeletedCategoryIsDroppedAndTheReviewSaysSo() async {
        let api = FakeMirachAPI()
        let viewModel = await reviewing(api)
        viewModel.choose(SampleData.Cat.supermercado, forRow: 2)
        viewModel.choose(SampleData.Cat.restaurantes, forRow: 3)
        api.setCategoriasResults([.success(withoutSupermercado)])

        await viewModel.catalogDidChange()

        #expect(viewModel.edits == [3: SampleData.Cat.restaurantes], "only the edit of the deleted category goes")
        #expect(viewModel.reviewNotice == "Algunas categorías que elegiste ya no existen. Esas filas volvieron a su sugerencia.")
    }

    @Test func aChangeThatDeletedNothingTheEditsUseKeepsEveryEditAndSaysNothing() async {
        let api = FakeMirachAPI()
        let viewModel = await reviewing(api)
        viewModel.choose(SampleData.Cat.restaurantes, forRow: 2)

        await viewModel.catalogDidChange()

        #expect(viewModel.edits == [2: SampleData.Cat.restaurantes])
        #expect(viewModel.reviewNotice == nil)
    }

    @Test func withNoStatementInProgressTheCatalogIsNotRead() async {
        let api = FakeMirachAPI()
        let viewModel = SubirCartolaViewModel(api: api, staging: FakeCartolaStaging())

        await viewModel.catalogDidChange()

        #expect(api.categoriasCalls == 0)
    }

    @Test func aCatalogThatFailsToReloadOffersTheRetryAndStillPrunesOnTheNextSuccess() async {
        let api = FakeMirachAPI()
        let viewModel = await reviewing(api)
        viewModel.choose(SampleData.Cat.supermercado, forRow: 2)
        api.setCategoriasResults([.failure(URLError(.timedOut)), .success(withoutSupermercado)])

        await viewModel.catalogDidChange()
        #expect(viewModel.catalog == .failed)

        await viewModel.retryCatalog()
        #expect(viewModel.edits.isEmpty)
    }

    // MARK: the bucket detail

    private func make(_ api: FakeMirachAPI) -> DetalleBucketViewModel {
        DetalleBucketViewModel(api: api, bucket: .deseos, periodo: sept)
    }

    @Test func theBucketDetailReadsTheMonthAgainWhenTheCatalogChanges() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()

        await viewModel.catalogDidChange()

        #expect(api.detalleCalls.count == 2)
        #expect(api.detalleCalls.last == .init(bucket: .deseos, periodo: sept))
        #expect(viewModel.state == .loaded(SampleData.deseosDetalle), "no blank while it reads")
    }

    @Test func aFailedRereadKeepsTheGroupsAndSaysTheChangeDidApply() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        api.setDetalleResults([.failure(URLError(.timedOut))])

        await viewModel.catalogDidChange()

        #expect(viewModel.state == .loaded(SampleData.deseosDetalle))
        #expect(viewModel.notice == "El cambio se aplicó, pero no pudimos actualizar la lista. Desliza hacia abajo para actualizar.")
    }

    @Test func aBucketDetailThatNeverLoadedIsNotRereadByAChange() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)

        await viewModel.catalogDidChange()

        #expect(api.detalleCalls.isEmpty)
    }

    @Test func theCategorySheetReadsTheCatalogAgainTheNextTimeItOpens() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        let movement = SampleData.deseosDetalle.grupos[0].transacciones[0]
        await viewModel.beginReclassify(movement)
        viewModel.dismissSheet()
        #expect(api.categoriasCalls == 1)

        await viewModel.catalogDidChange()
        await viewModel.beginReclassify(movement)

        #expect(api.categoriasCalls == 2, "the sheet would otherwise offer a deleted category")
    }

    @Test func aDeletionFromTheCategoryDetailIsAnnouncedOnTheBucketDetail() async {
        let viewModel = make(FakeMirachAPI())
        await viewModel.load()

        viewModel.categoryDeleted(named: "Ropa")

        #expect(viewModel.announcement == "Categoría «Ropa» eliminada")
    }
}
