import Foundation
import Testing
@testable import Mirach

/// The review half of "Subir cartola": catalog, edits, confirm. Row 0 is suggested
/// Supermercado, 1 Restaurantes, 2 and 3 have no suggestion, 4 is a duplicate, 5 is an income (`SampleData.rows`).
@MainActor
struct SubirCartolaReviewTests {
    private let xlsx = URL(fileURLWithPath: "/picked/cartola.xlsx")
    private let pdf = URL(fileURLWithPath: "/picked/cartola.pdf")

    private func make(
        _ api: FakeMirachAPI = FakeMirachAPI(), _ staging: FakeCartolaStaging = FakeCartolaStaging()
    ) -> (SubirCartolaViewModel, FakeMirachAPI, FakeCartolaStaging) {
        (SubirCartolaViewModel(api: api, staging: staging), api, staging)
    }

    /// A view model already in `revisando`.
    private func reviewing(
        _ api: FakeMirachAPI = FakeMirachAPI(), _ staging: FakeCartolaStaging = FakeCartolaStaging()
    ) async -> (SubirCartolaViewModel, FakeMirachAPI, FakeCartolaStaging) {
        let made = make(api, staging)
        await made.0.chooseFile(xlsx)
        made.0.startReview()
        return made
    }

    // MARK: catalog

    @Test func reachingDecidiendoLoadsTheCatalog() async {
        let (viewModel, api, _) = make()

        await viewModel.chooseFile(xlsx)

        #expect(viewModel.state == .decidiendo(SampleData.preview))
        #expect(viewModel.catalog == .loaded(SampleData.catalog))
        #expect(api.categoriasCalls == 1)
    }

    @Test func aFailedCatalogBlocksTheReviewButNotUploadingAsIs() async {
        let api = FakeMirachAPI()
        api.setCategoriasResults([.failure(IngestaError.serverFailure)])
        let (viewModel, _, _) = make(api)

        await viewModel.chooseFile(xlsx)
        viewModel.startReview()

        #expect(viewModel.catalog == .failed)
        #expect(viewModel.state == .decidiendo(SampleData.preview))
        await viewModel.uploadAsIs()
        #expect(api.commitCalls.count == 1)
        #expect(api.commitCalls.first?.edits == [])
        #expect(viewModel.state == .exito(.init(banco: "Banco de Chile", totalTransacciones: 37, duplicadosOmitidos: 5)))
    }

    @Test func retryingTheCatalogEnablesTheReview() async {
        let api = FakeMirachAPI()
        api.setCategoriasResults([.failure(URLError(.notConnectedToInternet)), .success(SampleData.catalog)])
        let (viewModel, _, _) = make(api)
        await viewModel.chooseFile(xlsx)
        #expect(viewModel.catalog == .failed)

        await viewModel.retryCatalog()
        viewModel.startReview()

        #expect(viewModel.catalog == .loaded(SampleData.catalog))
        #expect(viewModel.state == .revisando(SampleData.preview))
    }

    @Test func anExpiredSessionWhileLoadingTheCatalogClearsTheFlow() async {
        let api = FakeMirachAPI()
        api.setCategoriasResults([.failure(APIError.sessionExpired)])
        let (viewModel, _, staging) = make(api)

        await viewModel.chooseFile(xlsx)

        #expect(viewModel.state == .inicial(message: nil))
        #expect(staging.discarded.count == 1)
    }

    @Test func reviewingStartsFromTheDecisionOnly() async {
        let (viewModel, _, _) = make()

        viewModel.startReview()
        #expect(viewModel.state == .inicial(message: nil))

        await viewModel.chooseFile(xlsx)
        viewModel.startReview()
        #expect(viewModel.state == .revisando(SampleData.preview))
    }

    // MARK: edits

    @Test func choosingACategoryStoresOnlyThatRow() async {
        let (viewModel, _, _) = await reviewing()

        viewModel.choose(SampleData.Cat.fondo, forRow: 2)

        #expect(viewModel.edits == [2: SampleData.Cat.fondo])
    }

    @Test func theLastChoiceForARowWins() async {
        let (viewModel, _, _) = await reviewing()

        viewModel.choose(SampleData.Cat.fondo, forRow: 2)
        viewModel.choose(SampleData.Cat.transporte, forRow: 2)

        #expect(viewModel.edits == [2: SampleData.Cat.transporte])
    }

    @Test func choosingBackTheSuggestedCategoryUndoesTheEdit() async {
        let (viewModel, _, _) = await reviewing()
        viewModel.choose(SampleData.Cat.fondo, forRow: 0)

        viewModel.choose(SampleData.Cat.supermercado, forRow: 0)

        #expect(viewModel.edits.isEmpty)
    }

    @Test func aRowWithoutSuggestionKeepsTheEditEvenIfItIsTheInternalDefault() async {
        // There is no suggested id to compare with: choosing «Deseos · Desconocido» pins it.
        let (viewModel, _, _) = await reviewing()

        viewModel.choose(SampleData.Cat.desconocidoDeseos, forRow: 2)

        #expect(viewModel.edits == [2: SampleData.Cat.desconocidoDeseos])
    }

    @Test func aDuplicateRowIsNotEditable() async {
        let (viewModel, _, _) = await reviewing()

        viewModel.choose(SampleData.Cat.fondo, forRow: 4)

        #expect(viewModel.edits.isEmpty)
    }

    @Test func aRowThatDoesNotExistOrACategoryOutsideTheCatalogIsIgnored() async {
        let (viewModel, _, _) = await reviewing()

        viewModel.choose(SampleData.Cat.fondo, forRow: 99)
        viewModel.choose("not-in-catalog", forRow: 1)

        #expect(viewModel.edits.isEmpty)
    }

    @Test func editsAreIgnoredOutsideTheReview() async {
        let (viewModel, _, _) = make()
        await viewModel.chooseFile(xlsx)

        viewModel.choose(SampleData.Cat.fondo, forRow: 1)

        #expect(viewModel.edits.isEmpty)
    }

    @Test func theEditsLimitRefusesTheEditThatWouldExceedIt() async {
        // Huge ids so a few edits reach 256 KB without a statement of thousands of rows.
        let huge = String(repeating: "x", count: 100_000)
        let catalog = CatalogoCategorias(categorias: [
            CategoriaCatalogo(id: "a", nombre: "A", bucket: .necesidades),
            CategoriaCatalogo(id: huge + "1", nombre: "B", bucket: .necesidades),
            CategoriaCatalogo(id: huge + "2", nombre: "C", bucket: .necesidades),
            CategoriaCatalogo(id: huge + "3", nombre: "D", bucket: .necesidades),
        ])
        let api = FakeMirachAPI()
        api.setCategoriasResults([.success(catalog)])
        let (viewModel, _, _) = await reviewing(api)

        viewModel.choose(huge + "1", forRow: 0)
        viewModel.choose(huge + "2", forRow: 1)
        #expect(viewModel.reviewNotice == nil)
        viewModel.choose(huge + "3", forRow: 2)

        #expect(viewModel.edits.keys.sorted() == [0, 1])
        #expect(viewModel.reviewNotice == SubirCartolaViewModel.tooManyEditsMessage)
        // Replacing an existing edit with one of the same size still fits.
        viewModel.choose(huge + "2", forRow: 0)
        #expect(viewModel.edits[0] == huge + "2")
        #expect(CartolaEdit.json(viewModel.edits.map { CartolaEdit(rowIndex: $0.key, categoriaId: $0.value) }).utf8.count
            <= CartolaEdit.maxJSONBytes)
    }

    // MARK: confirm

    @Test func confirmingSendsOnlyTheTouchedRowsInOrderAndEndsInSuccess() async {
        let (viewModel, api, staging) = await reviewing()
        viewModel.choose(SampleData.Cat.fondo, forRow: 3)
        viewModel.choose(SampleData.Cat.transporte, forRow: 0)

        await viewModel.confirm()

        #expect(api.commitCalls.count == 1)
        #expect(api.commitCalls.first?.edits == [
            CartolaEdit(rowIndex: 0, categoriaId: SampleData.Cat.transporte),
            CartolaEdit(rowIndex: 3, categoriaId: SampleData.Cat.fondo),
        ])
        #expect(viewModel.state == .exito(.init(banco: "Banco de Chile", totalTransacciones: 37, duplicadosOmitidos: 5)))
        #expect(viewModel.edits.isEmpty)
        #expect(staging.discarded.count == 1)
    }

    @Test func confirmingWithoutEditsSendsAnEmptyList() async {
        let (viewModel, api, _) = await reviewing()

        await viewModel.confirm()

        #expect(api.commitCalls.first?.edits == [])
    }

    @Test func confirmingResendsThePasswordAndTheStagedFile() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([.failure(IngestaError.passwordRequired), .success(SampleData.preview)])
        let (viewModel, _, _) = make(api)
        await viewModel.chooseFile(pdf)
        await viewModel.submitPassword("buena")
        viewModel.startReview()
        viewModel.choose(SampleData.Cat.fondo, forRow: 1)

        await viewModel.confirm()

        #expect(api.commitCalls.first?.password == "buena")
        #expect(api.commitCalls.first?.file == api.previewCalls.last?.file)
    }

    @Test func confirmIsIgnoredOutsideTheReviewOrWhileTheCatalogIsNotLoaded() async {
        let (viewModel, api, _) = make()
        await viewModel.chooseFile(xlsx)

        await viewModel.confirm()

        #expect(api.commitCalls.isEmpty)
        #expect(viewModel.state == .decidiendo(SampleData.preview))
    }

    @Test func aBadEditsAnswerGoesBackToTheReviewReloadsTheCatalogAndKeepsValidEdits() async {
        let api = FakeMirachAPI()
        api.setCommitResults([.failure(IngestaError.rejected(message: "categoriaId fuera del catálogo")), .success(SampleData.commit)])
        let (viewModel, _, staging) = await reviewing(api)
        viewModel.choose(SampleData.Cat.fondo, forRow: 2)
        viewModel.choose(SampleData.Cat.restaurantes, forRow: 3)
        // The catalog changed meanwhile: «Fondo de emergencia» is gone.
        let newCatalog = CatalogoCategorias(categorias: SampleData.catalog.categorias.filter { $0.id != SampleData.Cat.fondo })
        api.setCategoriasResults([.success(newCatalog)])

        await viewModel.confirm()

        #expect(viewModel.state == .revisando(SampleData.preview))
        #expect(viewModel.reviewNotice == SubirCartolaViewModel.badEditsMessage)
        #expect(viewModel.catalog == .loaded(newCatalog))
        #expect(api.categoriasCalls == 2)
        #expect(viewModel.edits == [3: SampleData.Cat.restaurantes])
        #expect(staging.discarded.isEmpty, "the file survives to try again")
        await viewModel.confirm()
        #expect(api.commitCalls.last?.edits == [CartolaEdit(rowIndex: 3, categoriaId: SampleData.Cat.restaurantes)])
    }

    @Test func aFailedCatalogReloadAfterABadEditsAnswerPrunesOnTheRetryThatSucceeds() async {
        let api = FakeMirachAPI()
        api.setCommitResults([.failure(IngestaError.rejected(message: "categoriaId fuera del catálogo"))])
        let (viewModel, _, _) = await reviewing(api)
        viewModel.choose(SampleData.Cat.fondo, forRow: 2)
        viewModel.choose(SampleData.Cat.restaurantes, forRow: 3)
        let newCatalog = CatalogoCategorias(categorias: SampleData.catalog.categorias.filter { $0.id != SampleData.Cat.fondo })
        api.setCategoriasResults([.failure(URLError(.notConnectedToInternet)), .success(newCatalog)])

        await viewModel.confirm()
        #expect(viewModel.state == .revisando(SampleData.preview))
        #expect(viewModel.catalog == .failed)

        await viewModel.retryCatalog()

        #expect(viewModel.catalog == .loaded(newCatalog))
        #expect(viewModel.edits == [3: SampleData.Cat.restaurantes])
    }

    @Test func aRejectionThatPruningCannotExplainShowsTheServerMessageAndGoesBackToTheStart() async {
        // The edits' categories all still exist: the 400 is about something else (the file).
        let api = FakeMirachAPI()
        api.setPreviewResults([.failure(IngestaError.passwordRequired), .success(SampleData.preview)])
        api.setCommitResults([.failure(IngestaError.rejected(message: "Archivo inválido"))])
        let staging = FakeCartolaStaging()
        let (viewModel, _, _) = make(api, staging)
        await viewModel.chooseFile(pdf)
        await viewModel.submitPassword("buena")
        viewModel.startReview()
        viewModel.choose(SampleData.Cat.fondo, forRow: 2)

        await viewModel.confirm()

        #expect(viewModel.state == .inicial(message: "Archivo inválido"))
        #expect(viewModel.edits.isEmpty)
        #expect(viewModel.stagedFile == nil)
        #expect(staging.discarded.count == 1)
        await viewModel.chooseFile(pdf)
        #expect(api.previewCalls.last?.password == nil)
    }

    @Test func aSecondRejectionAfterAPruneShowsTheServerMessageAndGoesBackToTheStart() async {
        let api = FakeMirachAPI()
        api.setCommitResults([.failure(IngestaError.rejected(message: "Ediciones inválidas"))])
        let (viewModel, _, staging) = await reviewing(api)
        viewModel.choose(SampleData.Cat.fondo, forRow: 2)
        viewModel.choose(SampleData.Cat.restaurantes, forRow: 3)
        api.setCategoriasResults([.success(
            CatalogoCategorias(categorias: SampleData.catalog.categorias.filter { $0.id != SampleData.Cat.fondo })
        )])
        await viewModel.confirm()
        #expect(viewModel.state == .revisando(SampleData.preview))
        #expect(viewModel.edits == [3: SampleData.Cat.restaurantes])

        await viewModel.confirm()

        #expect(viewModel.state == .inicial(message: "Ediciones inválidas"))
        #expect(staging.discarded.count == 1)
    }

    @Test func aRejectedCommitWithoutEditsStillGoesBackToTheStart() async {
        let api = FakeMirachAPI()
        api.setCommitResults([.failure(IngestaError.rejected(message: "Archivo inválido"))])
        let (viewModel, _, _) = await reviewing(api)

        await viewModel.confirm()

        #expect(viewModel.state == .inicial(message: "Archivo inválido"))
    }

    @Test func otherCommitErrorsKeepTheEditsAndRetryResendsThem() async {
        let api = FakeMirachAPI()
        api.setCommitResults([.failure(IngestaError.serverFailure), .success(SampleData.commit)])
        let (viewModel, _, _) = await reviewing(api)
        viewModel.choose(SampleData.Cat.fondo, forRow: 2)
        await viewModel.confirm()
        #expect(viewModel.state == .errorImportacion(.server))

        await viewModel.retryImport()

        #expect(api.commitCalls.count == 2)
        #expect(api.commitCalls.first == api.commitCalls.last)
        #expect(api.commitCalls.last?.edits == [CartolaEdit(rowIndex: 2, categoriaId: SampleData.Cat.fondo)])
        if case .exito = viewModel.state {} else { Issue.record("expected exito, got \(viewModel.state)") }
    }

    @Test func fromAnImportErrorThePersonCanGoBackToTheReviewWithTheEditsIntact() async {
        let api = FakeMirachAPI()
        api.setCommitResults([.failure(URLError(.networkConnectionLost))])
        let (viewModel, _, _) = await reviewing(api)
        viewModel.choose(SampleData.Cat.fondo, forRow: 2)
        await viewModel.confirm()
        #expect(viewModel.canReturnToReview)

        viewModel.backToReview()

        #expect(viewModel.state == .revisando(SampleData.preview))
        #expect(viewModel.edits == [2: SampleData.Cat.fondo])
    }

    @Test func anUploadAsIsErrorOffersNoWayBackToTheReview() async {
        let api = FakeMirachAPI()
        api.setCommitResults([.failure(IngestaError.serverFailure)])
        let (viewModel, _, _) = make(api)
        await viewModel.chooseFile(xlsx)
        await viewModel.uploadAsIs()

        #expect(!viewModel.canReturnToReview)
        viewModel.backToReview()
        #expect(viewModel.state == .errorImportacion(.server))
    }

    @Test func aRetryAfterAnUploadAsIsErrorResendsNoEdits() async {
        let api = FakeMirachAPI()
        api.setCommitResults([.failure(IngestaError.serverFailure), .success(SampleData.commit)])
        let (viewModel, _, _) = make(api)
        await viewModel.chooseFile(xlsx)
        await viewModel.uploadAsIs()

        await viewModel.retryImport()

        #expect(api.commitCalls.map(\.edits) == [[], []])
    }

    // MARK: discard

    @Test func discardingTheReviewDropsEditsPasswordAndTheStagedCopy() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([.failure(IngestaError.passwordRequired), .success(SampleData.preview)])
        let staging = FakeCartolaStaging()
        let (viewModel, _, _) = make(api, staging)
        await viewModel.chooseFile(pdf)
        await viewModel.submitPassword("buena")
        viewModel.startReview()
        viewModel.choose(SampleData.Cat.fondo, forRow: 2)

        viewModel.discard()

        #expect(viewModel.state == .inicial(message: nil))
        #expect(viewModel.edits.isEmpty)
        #expect(viewModel.reviewNotice == nil)
        #expect(viewModel.stagedFile == nil)
        #expect(staging.discarded.map(\.filename) == ["cartola.pdf"])
        await viewModel.confirm()
        #expect(api.commitCalls.isEmpty)
        // The next flow starts clean: no password, no edits.
        await viewModel.chooseFile(xlsx)
        #expect(api.previewCalls.last?.password == nil)
        viewModel.startReview()
        #expect(viewModel.edits.isEmpty)
    }

    @Test func aLateCatalogAnswerAfterDiscardingIsDropped() async {
        let api = FakeMirachAPI()
        let gate = Gate()
        api.categoriasGate = gate
        let (viewModel, _, _) = make(api)

        let choosing = Task { await viewModel.chooseFile(xlsx) }
        await gate.waitUntilWaiting()
        #expect(viewModel.state == .decidiendo(SampleData.preview))
        #expect(viewModel.catalog == .loading)
        viewModel.discard()
        await gate.open()
        await choosing.value

        #expect(viewModel.state == .inicial(message: nil))
        #expect(viewModel.catalog == .loading)
    }
}
