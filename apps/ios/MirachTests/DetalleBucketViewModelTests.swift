import Foundation
import Testing
@testable import Mirach

@MainActor
struct DetalleBucketViewModelTests {
    private let sept = Periodo("2026-09")!

    private func periodos(_ texts: String...) -> [Periodo] { texts.compactMap(Periodo.init) }

    private func make(
        _ api: FakeMirachAPI = FakeMirachAPI(), bucket: Bucket = .deseos,
        reclassified: @escaping @MainActor () -> Void = {}
    ) -> DetalleBucketViewModel {
        DetalleBucketViewModel(api: api, bucket: bucket, periodo: Periodo("2026-09")!, onReclassified: reclassified)
    }

    /// Sample data: movement t-1 is in Restaurantes (Deseos).
    private var firstMovement: MovimientoBucket { SampleData.deseosDetalle.grupos[0].transacciones[0] }

    // MARK: loading

    @Test func startsLoadingThenShowsTheBucketOfTheMonthItWasOpenedFor() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        #expect(viewModel.state == .loading)

        await viewModel.load()

        #expect(viewModel.state == .loaded(SampleData.deseosDetalle))
        #expect(api.detalleCalls == [.init(bucket: .deseos, periodo: sept)])
    }

    @Test func anEmptyMonthIsLoadedSoTheScreenCanShowItsEmptyState() async {
        let api = FakeMirachAPI()
        api.setDetalleResults([.success(SampleData.deseosVacio)])
        let viewModel = make(api)

        await viewModel.load()

        #expect(viewModel.state == .loaded(SampleData.deseosVacio))
    }

    @Test func aNetworkErrorIsAConnectionFailureAndRetryAsksForTheSameMonthAgain() async {
        let api = FakeMirachAPI()
        api.setDetalleResults([.failure(URLError(.notConnectedToInternet)), .success(SampleData.deseosDetalle)])
        let viewModel = make(api)

        await viewModel.load()
        #expect(viewModel.state == .failed(.connection))

        await viewModel.retry()
        #expect(viewModel.state == .loaded(SampleData.deseosDetalle))
        #expect(api.detalleCalls.map(\.periodo) == [sept, sept])
    }

    @Test func serverAndDecodingProblemsAreServerFailures() async {
        for error: any Error in [APIError.badStatus(503), DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: ""))] {
            let api = FakeMirachAPI()
            api.setDetalleResults([.failure(error)])
            let viewModel = make(api)
            await viewModel.load()
            #expect(viewModel.state == .failed(.server))
        }
    }

    @Test func cancellationLeavesTheStateAlone() async {
        for error: any Error in [CancellationError(), URLError(.cancelled)] {
            let api = FakeMirachAPI()
            api.setDetalleResults([.failure(error)])
            let viewModel = make(api)
            await viewModel.load()
            #expect(viewModel.state == .loading)
        }
    }

    @Test func aRejectedSessionSignsOutThroughTheSingle401PathAndShowsNoError() async throws {
        let transport = FakeTransport.json(#"{"message":"x","code":"SESION_INVALIDA"}"#, status: .unauthorized)
        let store = InMemorySessionStore(session: nil)
        let dependencies = AppEnvironment.make(arguments: [], apiKey: "k", store: store, transport: transport)
        try dependencies.session.signIn(
            Session(token: "tok-sent", userId: "u-1", expiresAt: Date(timeIntervalSince1970: 4_000_000_000))
        )
        let viewModel = DetalleBucketViewModel(api: dependencies.api, bucket: .deseos, periodo: sept)

        await viewModel.load()
        await dependencies.expiryRelay.waitForDelivery()

        #expect(dependencies.session.phase == .signedOut)
        #expect(store.load() == nil)
        if case .failed = viewModel.state { Issue.record("an expired session must not show an error") }
    }

    // MARK: months

    @Test func theArrowsStepThroughTheMonthsThatHaveData() async {
        let api = FakeMirachAPI(periodosResult: .success(periodos("2026-09", "2026-08", "2026-07")))
        let viewModel = make(api)

        await viewModel.load()

        #expect(viewModel.siguiente == nil)
        #expect(viewModel.anterior == Periodo("2026-08"))
        await viewModel.select(Periodo("2026-08")!)
        #expect(viewModel.periodo == Periodo("2026-08"))
        #expect(api.detalleCalls.last == .init(bucket: .deseos, periodo: Periodo("2026-08")!))
        #expect(viewModel.siguiente == sept)
        #expect(viewModel.anterior == Periodo("2026-07"))
    }

    @Test func aFailingPeriodsListDoesNotHideTheDetail() async {
        let api = FakeMirachAPI(periodosResult: .failure(URLError(.timedOut)))
        let viewModel = make(api)

        await viewModel.load()

        #expect(viewModel.state == .loaded(SampleData.deseosDetalle))
        #expect(viewModel.anterior == nil && viewModel.siguiente == nil)
    }

    @Test func aLateAnswerForAnOlderMonthDoesNotOverwriteTheNewerOne() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        let gate = Gate()
        api.detalleGate = gate
        // The July request gets its own recognisable answer, fixed when it is made but delivered late.
        let july = BucketDetalle(
            bucket: .deseos, periodo: Periodo("2026-07")!, total: 1, porcentajeBp: nil, metaBp: nil,
            totalTransacciones: 0, totalCategorias: 0, grupos: []
        )
        api.setDetalleResults([.success(july)])

        let first = Task { await viewModel.select(Periodo("2026-07")!) }
        await gate.waitUntilWaiting()
        api.detalleGate = nil
        api.setDetalleResults([.success(SampleData.deseosDetalle)])
        await viewModel.select(Periodo("2026-08")!)
        await gate.open()
        await first.value

        #expect(viewModel.state == .loaded(SampleData.deseosDetalle))
        #expect(viewModel.state != .loaded(july))
        #expect(viewModel.periodo == Periodo("2026-08"))
    }

    @Test func aLoadCancelledBeforeItFinishedRunsAgainOnTheNextAppearance() async {
        let api = FakeMirachAPI()
        api.setDetalleResults([.failure(CancellationError()), .success(SampleData.deseosDetalle)])
        let viewModel = make(api)

        await viewModel.loadIfNeeded()
        #expect(viewModel.state == .loading)

        await viewModel.loadIfNeeded()
        #expect(viewModel.state == .loaded(SampleData.deseosDetalle))
        // Once loaded, appearing again does not drop the month.
        await viewModel.loadIfNeeded()
        #expect(api.detalleCalls.count == 2)
    }

    @Test func anInitialLoadSupersededByARefreshStillMarksTheMonthLoaded() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        let gate = Gate()
        api.detalleGate = gate

        let initial = Task { await viewModel.loadIfNeeded() }
        await gate.waitUntilWaiting()
        api.detalleGate = nil
        await viewModel.refresh()
        await gate.open()
        await initial.value
        await viewModel.loadIfNeeded()

        #expect(viewModel.state == .loaded(SampleData.deseosDetalle))
        #expect(api.detalleCalls.count == 2, "appearing again must not reload and blank the list")
    }

    @Test func aFailedRefreshSaysSoAndTheNextSuccessClearsIt() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        api.setDetalleResults([.failure(URLError(.timedOut))])

        await viewModel.refresh()

        #expect(viewModel.state == .loaded(SampleData.deseosDetalle))
        #expect(viewModel.notice == "No se pudo actualizar la lista.")

        api.setDetalleResults([.success(SampleData.deseosDetalle)])
        await viewModel.refresh()
        #expect(viewModel.notice == nil)
    }

    @Test func retryFetchesTheMonthsAgainWhenTheirFirstLoadFailed() async {
        let api = FakeMirachAPI(periodosResult: .failure(URLError(.timedOut)))
        let viewModel = make(api)
        await viewModel.load()
        #expect(viewModel.anterior == nil)

        api.setPeriodosResult(.success(periodos("2026-09", "2026-08")))
        await viewModel.retry()

        #expect(viewModel.anterior == Periodo("2026-08"))
    }

    @Test func aFailedRefreshKeepsTheMovementsOnScreen() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        api.setDetalleResults([.failure(URLError(.timedOut))])

        await viewModel.refresh()

        #expect(viewModel.state == .loaded(SampleData.deseosDetalle))
    }

    // MARK: reclassification: catalog

    @Test func openingTheSheetLoadsTheCatalogOnceAndReusesItAfterwards() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()

        await viewModel.beginReclassify(firstMovement)
        #expect(viewModel.sheetMovement == firstMovement)
        #expect(viewModel.catalog == .loaded(SampleData.catalog))
        viewModel.dismissSheet()
        #expect(viewModel.sheetMovement == nil)
        await viewModel.beginReclassify(firstMovement)

        #expect(api.categoriasCalls == 1)
    }

    @Test func aCatalogFailureIsShownInTheSheetAndRetryRecovers() async {
        let api = FakeMirachAPI()
        api.setCategoriasResults([.failure(URLError(.timedOut)), .success(SampleData.catalog)])
        let viewModel = make(api)
        await viewModel.load()

        await viewModel.beginReclassify(firstMovement)
        #expect(viewModel.catalog == .failed)
        // The rest of the screen stays usable.
        #expect(viewModel.state == .loaded(SampleData.deseosDetalle))

        await viewModel.retryCatalog()
        #expect(viewModel.catalog == .loaded(SampleData.catalog))
    }

    // MARK: reclassification: choosing, then «Guardar» (Figma 09)

    @Test func pickingACategoryOnlySelectsItAndSendsNothing() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(firstMovement)

        await viewModel.choose(categoryId: SampleData.Cat.desconocidoDeseos)

        #expect(viewModel.selection == SampleData.catalog.categoria(id: SampleData.Cat.desconocidoDeseos))
        #expect(viewModel.canSave)
        #expect(api.reclasificarCalls.isEmpty)
        #expect(viewModel.pendingChange == nil)
        #expect(viewModel.sheetMovement == firstMovement)
        #expect(viewModel.announcement == nil)
    }

    @Test func guardarIsDisabledAndDoesNothingUntilACategoryIsPicked() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(firstMovement)
        #expect(viewModel.selection == nil)
        #expect(viewModel.canSave == false)

        await viewModel.save()

        #expect(api.reclasificarCalls.isEmpty)
        #expect(viewModel.sheetMovement == firstMovement)
    }

    @Test func guardarWithACategoryOfTheSameBucketSendsItsIdOnceAndRefreshesEverything() async {
        let api = FakeMirachAPI()
        api.setReclasificarResults([.success(.init(categoriaId: SampleData.Cat.restaurantes, categoriaNombre: "Restaurantes", bucket: .deseos))])
        api.setDetalleResults([.success(SampleData.deseosDetalle), .success(SampleData.deseosVacio)])
        let changes = CallCounter()
        let viewModel = make(api, reclassified: { changes.bump() })
        await viewModel.load()
        // t-3 is in Suscripciones: moving it to Restaurantes stays inside Deseos.
        let netflix = SampleData.deseosDetalle.grupos[1].transacciones[0]
        await viewModel.beginReclassify(netflix)
        await viewModel.choose(categoryId: SampleData.Cat.restaurantes)

        await viewModel.save()

        #expect(api.reclasificarCalls == [.init(transaccionId: "t-3", categoriaId: SampleData.Cat.restaurantes)])
        #expect(viewModel.pendingChange == nil)
        #expect(viewModel.sheetMovement == nil)
        #expect(viewModel.selection == nil)
        #expect(viewModel.announcement == "Movida a Gustos · Restaurantes")
        #expect(api.detalleCalls.count == 2)
        #expect(viewModel.state == .loaded(SampleData.deseosVacio))
        #expect(changes.count == 1)
    }

    @Test func theAnnouncementReportsWhereTheServerPutTheMovementNotWhatWasPicked() async {
        let api = FakeMirachAPI()
        api.setReclasificarResults([.success(.init(categoriaId: "x", categoriaNombre: "Otra", bucket: .ahorro))])
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(firstMovement)
        await viewModel.choose(categoryId: SampleData.Cat.desconocidoDeseos)

        await viewModel.save()

        #expect(viewModel.announcement == "Movida a Ahorro · Otra")
    }

    @Test func aCategoryOfAnotherBucketAsksForConfirmationOnGuardarBeforeCallingTheAPI() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(firstMovement)

        await viewModel.choose(categoryId: SampleData.Cat.supermercado)
        #expect(viewModel.pendingChange == nil, "picking alone asks nothing")

        await viewModel.save()

        let category = SampleData.catalog.categoria(id: SampleData.Cat.supermercado)!
        #expect(viewModel.pendingChange == .init(movement: firstMovement, category: category))
        #expect(api.reclasificarCalls.isEmpty)
        #expect(viewModel.sheetMovement == firstMovement)
    }

    @Test func cancellingTheConfirmationKeepsTheSheetAndTheSelectionWithoutCallingTheAPI() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(firstMovement)
        await viewModel.choose(categoryId: SampleData.Cat.supermercado)
        await viewModel.save()

        viewModel.cancelBucketChange()

        #expect(viewModel.pendingChange == nil)
        #expect(api.reclasificarCalls.isEmpty)
        #expect(viewModel.sheetMovement == firstMovement)
        #expect(viewModel.selection?.id == SampleData.Cat.supermercado)
        #expect(viewModel.canSave)
    }

    @Test func confirmingTheBucketChangeSendsTheCategoryId() async {
        let api = FakeMirachAPI()
        api.setReclasificarResults([.success(.init(categoriaId: SampleData.Cat.supermercado, categoriaNombre: "Supermercado", bucket: .necesidades))])
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(firstMovement)
        await viewModel.choose(categoryId: SampleData.Cat.supermercado)
        await viewModel.save()

        await viewModel.confirmBucketChange()

        #expect(api.reclasificarCalls == [.init(transaccionId: "t-1", categoriaId: SampleData.Cat.supermercado)])
        #expect(viewModel.pendingChange == nil)
        #expect(viewModel.announcement == "Movida a Necesidades · Supermercado")
    }

    @Test func pickingTheCategoryItAlreadyHasLeavesNothingToSave() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(firstMovement)
        await viewModel.choose(categoryId: SampleData.Cat.desconocidoDeseos)

        await viewModel.choose(categoryId: SampleData.Cat.restaurantes)
        await viewModel.save()

        #expect(viewModel.selection == nil)
        #expect(viewModel.canSave == false)
        #expect(api.reclasificarCalls.isEmpty)
        #expect(viewModel.sheetMovement == firstMovement)
        #expect(viewModel.announcement == nil)
    }

    @Test func aMovementWithoutCategoryCanBeMovedToAnyCategory() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        let unclassified = SampleData.deseosDetalle.grupos[2].transacciones[0]
        await viewModel.beginReclassify(unclassified)
        await viewModel.choose(categoryId: SampleData.Cat.restaurantes)

        await viewModel.save()

        #expect(api.reclasificarCalls == [.init(transaccionId: "t-4", categoriaId: SampleData.Cat.restaurantes)])
    }

    @Test func theMovementShowsProgressAndAcceptsNoOtherActionUntilTheCallEnds() async {
        let api = FakeMirachAPI()
        let gate = Gate()
        api.reclasificarGate = gate
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(firstMovement)
        await viewModel.choose(categoryId: SampleData.Cat.desconocidoDeseos)

        let moving = Task { await viewModel.save() }
        await gate.waitUntilWaiting()
        #expect(viewModel.reclassifyingId == "t-1")
        #expect(viewModel.canSave == false)
        await viewModel.choose(categoryId: SampleData.Cat.restaurantes)
        await viewModel.save()
        await gate.open()
        await moving.value

        #expect(api.reclasificarCalls.count == 1)
        #expect(viewModel.reclassifyingId == nil)
    }

    // MARK: reclassification: failures

    /// Picks the "Desconocido" of Deseos for t-1 and taps «Guardar».
    private func pickAndSave(_ viewModel: DetalleBucketViewModel) async {
        await viewModel.beginReclassify(firstMovement)
        await viewModel.choose(categoryId: SampleData.Cat.desconocidoDeseos)
        await viewModel.save()
    }

    @Test func aCategoryThatNoLongerExistsKeepsTheMovementShowsAMessageAndReloadsTheCatalog() async {
        let api = FakeMirachAPI()
        api.setReclasificarResults([.failure(ReclasificarError.categoryNotFound)])
        let changes = CallCounter()
        let viewModel = make(api, reclassified: { changes.bump() })
        await viewModel.load()

        await pickAndSave(viewModel)

        #expect(viewModel.sheetNotice == "Esa categoría ya no existe. Elige otra.")
        #expect(viewModel.selection == nil, "the category is gone: nothing left to save")
        #expect(api.categoriasCalls == 2)
        #expect(viewModel.sheetMovement == firstMovement)
        #expect(viewModel.state == .loaded(SampleData.deseosDetalle))
        #expect(api.detalleCalls.count == 1)
        #expect(changes.count == 0)
        #expect(viewModel.reclassifyingId == nil)
    }

    @Test func aMovementThatNoLongerExistsClosesTheSheetAndReloadsTheDetail() async {
        let api = FakeMirachAPI()
        api.setReclasificarResults([.failure(ReclasificarError.movementNotFound)])
        let viewModel = make(api)
        await viewModel.load()

        await pickAndSave(viewModel)

        #expect(viewModel.notice == "Ese movimiento ya no existe.")
        #expect(viewModel.sheetMovement == nil)
        #expect(api.detalleCalls.count == 2)
    }

    @Test func aConnectionFailureKeepsTheMovementTheSheetAndTheSelectionWithAMessage() async {
        let api = FakeMirachAPI()
        api.setReclasificarResults([.failure(URLError(.notConnectedToInternet))])
        let changes = CallCounter()
        let viewModel = make(api, reclassified: { changes.bump() })
        await viewModel.load()

        await pickAndSave(viewModel)

        #expect(viewModel.sheetNotice == "No pudimos mover el movimiento. Revisa tu conexión e inténtalo de nuevo.")
        #expect(viewModel.sheetMovement == firstMovement)
        #expect(viewModel.selection?.id == SampleData.Cat.desconocidoDeseos, "«Guardar» can be tapped again")
        #expect(viewModel.state == .loaded(SampleData.deseosDetalle))
        #expect(changes.count == 0)
    }

    @Test func aRejectedSessionWhileMovingShowsNoMessage() async {
        let api = FakeMirachAPI()
        api.setReclasificarResults([.failure(APIError.sessionExpired)])
        let viewModel = make(api)
        await viewModel.load()

        await pickAndSave(viewModel)

        #expect(viewModel.sheetNotice == nil && viewModel.notice == nil)
    }

    @Test func aFailedReloadAfterMovingKeepsTheListAndSaysSo() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        api.setDetalleResults([.failure(URLError(.timedOut))])

        await pickAndSave(viewModel)

        #expect(viewModel.state == .loaded(SampleData.deseosDetalle))
        #expect(viewModel.notice == "Se movió, pero no pudimos actualizar la lista. Desliza hacia abajo para actualizar.")
    }

    // MARK: creating a category from the sheet

    @Test func aNewCategoryIsAddedAndChosenAndGuardarAppliesIt() async {
        let api = FakeMirachAPI()
        let ropa = CategoriaCatalogo(id: "cat-ropa", nombre: "Ropa", bucket: .deseos)
        api.setCrearCategoriaResults([.success(ropa)])
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(firstMovement)

        await viewModel.createCategory(NuevaCategoria(nombre: "Ropa", bucket: .deseos, patron: nil))

        #expect(viewModel.catalog == .loaded(CatalogoCategorias(categorias: SampleData.catalog.categorias + [ropa])))
        #expect(viewModel.selection == ropa)
        #expect(api.reclasificarCalls.isEmpty, "the new category waits for «Guardar»")
        #expect(viewModel.createdCategoryCount == 1)
        #expect(viewModel.isCreatingCategory == false)

        await viewModel.save()

        #expect(api.reclasificarCalls == [.init(transaccionId: "t-1", categoriaId: "cat-ropa")])
    }

    @Test func aNewCategoryOfAnotherBucketStillAsksForConfirmationOnGuardar() async {
        let api = FakeMirachAPI()
        api.setCrearCategoriaResults([.success(CategoriaCatalogo(id: "cat-gym", nombre: "Gimnasio", bucket: .necesidades))])
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(firstMovement)

        await viewModel.createCategory(NuevaCategoria(nombre: "Gimnasio", bucket: .necesidades, patron: nil))
        #expect(viewModel.pendingChange == nil)
        await viewModel.save()

        #expect(viewModel.pendingChange?.category.id == "cat-gym")
        #expect(api.reclasificarCalls.isEmpty)
    }

    @Test func aRefusedCategoryShowsTheFormMessageAndMovesNothing() async {
        let api = FakeMirachAPI()
        api.setCrearCategoriaResults([.failure(CategoriaError.duplicateName)])
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(firstMovement)

        await viewModel.createCategory(NuevaCategoria(nombre: "Ropa", bucket: .deseos, patron: nil))

        #expect(viewModel.categoryFormErrors.name == "Ya tienes una categoría con ese nombre")
        #expect(api.reclasificarCalls.isEmpty)
        #expect(viewModel.selection == nil)
        #expect(viewModel.createdCategoryCount == 0)
        viewModel.resetCategoryForm()
        #expect(viewModel.categoryFormErrors.isEmpty)
    }

    // MARK: apply to similar movements (CLA-03, Figma 09)

    private let netflixSuggestion = Parecidos(patron: "netflix", total: 2, existente: nil)
    /// t-3 is in Suscripciones: Restaurantes keeps it inside Deseos (no confirmation).
    private var netflix: MovimientoBucket { SampleData.deseosDetalle.grupos[1].transacciones[0] }

    @Test func choosingACategoryAsksForSimilarMovementsOfTheScreensMonth() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(netflix)

        await viewModel.choose(categoryId: SampleData.Cat.restaurantes)

        #expect(api.parecidosCalls == [.init(transaccionId: "t-3", categoriaId: SampleData.Cat.restaurantes, periodo: sept)])
    }

    @Test func aSuggestionShowsTheCheckboxOffAndWaitsForGuardar() async {
        let api = FakeMirachAPI()
        api.setParecidosResults([.success(netflixSuggestion)])
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(netflix)

        await viewModel.choose(categoryId: SampleData.Cat.restaurantes)

        let restaurantes = SampleData.catalog.categoria(id: SampleData.Cat.restaurantes)!
        #expect(viewModel.suggestion == .init(movement: netflix, category: restaurantes, parecidos: netflixSuggestion))
        #expect(viewModel.applyToSimilar == false, "off by default")
        #expect(api.reclasificarCalls.isEmpty)
        #expect(viewModel.sheetMovement == netflix)
    }

    @Test func withoutASuggestionTheCheckboxIsHiddenAndGuardarSendsThePlainMove() async {
        let api = FakeMirachAPI()
        api.setParecidosResults([.success(.ninguno)])
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(netflix)

        await viewModel.choose(categoryId: SampleData.Cat.restaurantes)
        #expect(viewModel.suggestion == nil)
        #expect(api.reclasificarCalls.isEmpty, "the move still waits for «Guardar»")

        await viewModel.save()

        #expect(api.reclasificarCalls == [.init(transaccionId: "t-3", categoriaId: SampleData.Cat.restaurantes, aplicarAParecidos: nil)])
    }

    @Test func aFailedSimilarLookupHidesTheCheckboxAndNeverBlocksGuardar() async {
        let api = FakeMirachAPI()
        api.setParecidosResults([.failure(URLError(.notConnectedToInternet))])
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(netflix)

        await viewModel.choose(categoryId: SampleData.Cat.restaurantes)
        #expect(viewModel.suggestion == nil)
        #expect(viewModel.canSave)

        await viewModel.save()

        #expect(api.reclasificarCalls == [.init(transaccionId: "t-3", categoriaId: SampleData.Cat.restaurantes)])
        #expect(viewModel.sheetNotice == nil)
        #expect(viewModel.announcement == "Movida a Gustos · Restaurantes")
    }

    @Test func guardarWithTheCheckboxOffIsThePlainReclassification() async {
        let api = FakeMirachAPI()
        api.setParecidosResults([.success(netflixSuggestion)])
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(netflix)
        await viewModel.choose(categoryId: SampleData.Cat.restaurantes)

        await viewModel.save()

        #expect(api.reclasificarCalls == [.init(transaccionId: "t-3", categoriaId: SampleData.Cat.restaurantes, aplicarAParecidos: nil)])
        #expect(viewModel.suggestion == nil)
        #expect(viewModel.sheetMovement == nil)
    }

    @Test func guardarWithTheCheckboxOnAppliesToTheSimilarOnesOfTheMonthAndSaysHowMany() async {
        let api = FakeMirachAPI()
        api.setParecidosResults([.success(netflixSuggestion)])
        api.setReclasificarResults([.success(.init(
            categoriaId: SampleData.Cat.restaurantes, categoriaNombre: "Restaurantes", bucket: .deseos, movidos: 2
        ))])
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(netflix)
        await viewModel.choose(categoryId: SampleData.Cat.restaurantes)

        viewModel.applyToSimilar = true
        await viewModel.save()

        #expect(api.reclasificarCalls == [.init(transaccionId: "t-3", categoriaId: SampleData.Cat.restaurantes, aplicarAParecidos: sept)])
        #expect(viewModel.announcement == "Movida a Gustos · Restaurantes · 2 movidos")
    }

    @Test func applyingToAnotherBucketStillAsksAndKeepsTheChoiceThroughTheConfirmation() async {
        let api = FakeMirachAPI()
        api.setParecidosResults([.success(netflixSuggestion)])
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(netflix)
        await viewModel.choose(categoryId: SampleData.Cat.supermercado)
        viewModel.applyToSimilar = true

        await viewModel.save()
        #expect(api.reclasificarCalls.isEmpty, "the bucket change asks first")
        await viewModel.confirmBucketChange()

        #expect(api.reclasificarCalls == [.init(transaccionId: "t-3", categoriaId: SampleData.Cat.supermercado, aplicarAParecidos: sept)])
    }

    @Test func cancellingTheBucketChangeKeepsTheSuggestionAndTheCheckbox() async {
        let api = FakeMirachAPI()
        api.setParecidosResults([.success(netflixSuggestion)])
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(netflix)
        await viewModel.choose(categoryId: SampleData.Cat.supermercado)
        viewModel.applyToSimilar = true
        await viewModel.save()

        viewModel.cancelBucketChange()

        #expect(viewModel.selection?.id == SampleData.Cat.supermercado)
        #expect(viewModel.suggestion?.parecidos == netflixSuggestion)
        #expect(viewModel.applyToSimilar)
        #expect(api.reclasificarCalls.isEmpty)
    }

    @Test func choosingAnotherCategoryReplacesTheSuggestionAndTurnsTheCheckboxOff() async {
        let api = FakeMirachAPI()
        let other = Parecidos(patron: "netflix", total: 0, existente: nil)
        api.setParecidosResults([.success(netflixSuggestion), .success(other)])
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(netflix)
        await viewModel.choose(categoryId: SampleData.Cat.restaurantes)
        viewModel.applyToSimilar = true

        await viewModel.choose(categoryId: SampleData.Cat.desconocidoDeseos)

        #expect(viewModel.selection?.id == SampleData.Cat.desconocidoDeseos)
        #expect(viewModel.suggestion?.category.id == SampleData.Cat.desconocidoDeseos)
        #expect(viewModel.suggestion?.parecidos == other)
        #expect(viewModel.applyToSimilar == false)
    }

    @Test func closingTheSheetForgetsTheSelectionAndTheSuggestion() async {
        let api = FakeMirachAPI()
        api.setParecidosResults([.success(netflixSuggestion)])
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(netflix)
        await viewModel.choose(categoryId: SampleData.Cat.restaurantes)

        viewModel.dismissSheet()

        #expect(viewModel.selection == nil)
        #expect(viewModel.suggestion == nil)
        #expect(api.reclasificarCalls.isEmpty)
    }
}

private final class CallCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var _count = 0
    func bump() { lock.withLock { _count += 1 } }
    var count: Int { lock.withLock { _count } }
}
