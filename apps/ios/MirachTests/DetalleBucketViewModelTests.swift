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
        api.setDetalleResults([.success(SampleData.deseosVacio)])

        let first = Task { await viewModel.select(Periodo("2026-07")!) }
        await gate.waitUntilWaiting()
        api.detalleGate = nil
        api.setDetalleResults([.success(SampleData.deseosDetalle)])
        await viewModel.select(Periodo("2026-08")!)
        await gate.open()
        await first.value

        #expect(viewModel.state == .loaded(SampleData.deseosDetalle))
        #expect(viewModel.periodo == Periodo("2026-08"))
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

    // MARK: reclassification: choosing

    @Test func choosingACategoryOfTheSameBucketSendsItsIdAtOnceAndRefreshesEverything() async {
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

        #expect(api.reclasificarCalls == [.init(transaccionId: "t-3", categoriaId: SampleData.Cat.restaurantes)])
        #expect(viewModel.pendingChange == nil)
        #expect(viewModel.sheetMovement == nil)
        #expect(viewModel.announcement == "Movida a Deseos · Restaurantes")
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

        #expect(viewModel.announcement == "Movida a Ahorro · Otra")
    }

    @Test func aCategoryOfAnotherBucketAsksForConfirmationBeforeCallingTheAPI() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(firstMovement)

        await viewModel.choose(categoryId: SampleData.Cat.supermercado)

        let category = SampleData.catalog.categoria(id: SampleData.Cat.supermercado)!
        #expect(viewModel.pendingChange == .init(movement: firstMovement, category: category))
        #expect(api.reclasificarCalls.isEmpty)
        #expect(viewModel.sheetMovement == firstMovement)
    }

    @Test func cancellingTheConfirmationRevertsTheChoiceWithoutCallingTheAPI() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(firstMovement)
        await viewModel.choose(categoryId: SampleData.Cat.supermercado)

        viewModel.cancelBucketChange()

        #expect(viewModel.pendingChange == nil)
        #expect(api.reclasificarCalls.isEmpty)
        #expect(viewModel.sheetMovement == firstMovement)
    }

    @Test func confirmingTheBucketChangeSendsTheCategoryId() async {
        let api = FakeMirachAPI()
        api.setReclasificarResults([.success(.init(categoriaId: SampleData.Cat.supermercado, categoriaNombre: "Supermercado", bucket: .necesidades))])
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(firstMovement)
        await viewModel.choose(categoryId: SampleData.Cat.supermercado)

        await viewModel.confirmBucketChange()

        #expect(api.reclasificarCalls == [.init(transaccionId: "t-1", categoriaId: SampleData.Cat.supermercado)])
        #expect(viewModel.pendingChange == nil)
        #expect(viewModel.announcement == "Movida a Necesidades · Supermercado")
    }

    @Test func choosingTheCategoryItAlreadyHasDoesNothingAndClosesTheSheet() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(firstMovement)

        await viewModel.choose(categoryId: SampleData.Cat.restaurantes)

        #expect(api.reclasificarCalls.isEmpty)
        #expect(viewModel.sheetMovement == nil)
        #expect(viewModel.announcement == nil)
    }

    @Test func aMovementWithoutCategoryCanBeMovedToAnyCategory() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        let unclassified = SampleData.deseosDetalle.grupos[2].transacciones[0]
        await viewModel.beginReclassify(unclassified)

        await viewModel.choose(categoryId: SampleData.Cat.restaurantes)

        #expect(api.reclasificarCalls == [.init(transaccionId: "t-4", categoriaId: SampleData.Cat.restaurantes)])
    }

    @Test func theMovementShowsProgressAndAcceptsNoOtherActionUntilTheCallEnds() async {
        let api = FakeMirachAPI()
        let gate = Gate()
        api.reclasificarGate = gate
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(firstMovement)

        let moving = Task { await viewModel.choose(categoryId: SampleData.Cat.desconocidoDeseos) }
        await gate.waitUntilWaiting()
        #expect(viewModel.reclassifyingId == "t-1")
        await viewModel.choose(categoryId: SampleData.Cat.restaurantes)
        await gate.open()
        await moving.value

        #expect(api.reclasificarCalls.count == 1)
        #expect(viewModel.reclassifyingId == nil)
    }

    // MARK: reclassification: failures

    @Test func aCategoryThatNoLongerExistsKeepsTheMovementShowsAMessageAndReloadsTheCatalog() async {
        let api = FakeMirachAPI()
        api.setReclasificarResults([.failure(ReclasificarError.categoryNotFound)])
        let changes = CallCounter()
        let viewModel = make(api, reclassified: { changes.bump() })
        await viewModel.load()
        await viewModel.beginReclassify(firstMovement)

        await viewModel.choose(categoryId: SampleData.Cat.desconocidoDeseos)

        #expect(viewModel.sheetNotice == "Esa categoría ya no existe. Elige otra.")
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
        await viewModel.beginReclassify(firstMovement)

        await viewModel.choose(categoryId: SampleData.Cat.desconocidoDeseos)

        #expect(viewModel.notice == "Ese movimiento ya no existe.")
        #expect(viewModel.sheetMovement == nil)
        #expect(api.detalleCalls.count == 2)
    }

    @Test func aConnectionFailureKeepsTheMovementAndTheSheetWithAMessage() async {
        let api = FakeMirachAPI()
        api.setReclasificarResults([.failure(URLError(.notConnectedToInternet))])
        let changes = CallCounter()
        let viewModel = make(api, reclassified: { changes.bump() })
        await viewModel.load()
        await viewModel.beginReclassify(firstMovement)

        await viewModel.choose(categoryId: SampleData.Cat.desconocidoDeseos)

        #expect(viewModel.sheetNotice == "No pudimos mover el movimiento. Revisa tu conexión e inténtalo de nuevo.")
        #expect(viewModel.sheetMovement == firstMovement)
        #expect(viewModel.state == .loaded(SampleData.deseosDetalle))
        #expect(changes.count == 0)
    }

    @Test func aRejectedSessionWhileMovingShowsNoMessage() async {
        let api = FakeMirachAPI()
        api.setReclasificarResults([.failure(APIError.sessionExpired)])
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(firstMovement)

        await viewModel.choose(categoryId: SampleData.Cat.desconocidoDeseos)

        #expect(viewModel.sheetNotice == nil && viewModel.notice == nil)
    }

    @Test func aFailedReloadAfterMovingKeepsTheListAndSaysSo() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        api.setDetalleResults([.failure(URLError(.timedOut))])
        await viewModel.beginReclassify(firstMovement)

        await viewModel.choose(categoryId: SampleData.Cat.desconocidoDeseos)

        #expect(viewModel.state == .loaded(SampleData.deseosDetalle))
        #expect(viewModel.notice == "Se movió, pero no pudimos actualizar la lista. Desliza hacia abajo para actualizar.")
    }

    // MARK: creating a category from the sheet

    @Test func aNewCategoryOfTheSameBucketIsAddedChosenAndAppliedInOneStep() async {
        let api = FakeMirachAPI()
        api.setCrearCategoriaResults([.success(CategoriaCatalogo(id: "cat-ropa", nombre: "Ropa", bucket: .deseos))])
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(firstMovement)

        await viewModel.createCategory(NuevaCategoria(nombre: "Ropa", bucket: .deseos, patron: nil))

        #expect(viewModel.catalog == .loaded(CatalogoCategorias(categorias: SampleData.catalog.categorias + [CategoriaCatalogo(id: "cat-ropa", nombre: "Ropa", bucket: .deseos)])))
        #expect(api.reclasificarCalls == [.init(transaccionId: "t-1", categoriaId: "cat-ropa")])
        #expect(viewModel.createdCategoryCount == 1)
        #expect(viewModel.isCreatingCategory == false)
    }

    @Test func aNewCategoryOfAnotherBucketStillAsksForConfirmation() async {
        let api = FakeMirachAPI()
        api.setCrearCategoriaResults([.success(CategoriaCatalogo(id: "cat-gym", nombre: "Gimnasio", bucket: .necesidades))])
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.beginReclassify(firstMovement)

        await viewModel.createCategory(NuevaCategoria(nombre: "Gimnasio", bucket: .necesidades, patron: nil))

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
        #expect(viewModel.createdCategoryCount == 0)
        viewModel.resetCategoryForm()
        #expect(viewModel.categoryFormErrors.isEmpty)
    }
}

private final class CallCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var _count = 0
    func bump() { lock.withLock { _count += 1 } }
    var count: Int { lock.withLock { _count } }
}
