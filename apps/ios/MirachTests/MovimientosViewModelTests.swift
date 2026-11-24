import Foundation
import Testing
@testable import Mirach

@MainActor
struct MovimientosViewModelTests {
    private let sept = Periodo("2026-09")!
    private let agosto = Periodo("2026-08")!

    private var necesidades: BucketDetalle {
        BucketDetalle(
            bucket: .necesidades, periodo: sept, total: 569_400, porcentajeBp: 5200, metaBp: 5000,
            totalTransacciones: 1, totalCategorias: 1,
            grupos: [
                GrupoCategoria(
                    categoriaId: SampleData.Cat.supermercado, nombre: "Supermercado", icono: nil, subtotal: 569_400, conteo: 1,
                    transacciones: [MovimientoBucket(id: "t-n1", fecha: SampleData.date(day: 0), descripcion: "LIDER", origen: "Manual", monto: 569_400)]
                )
            ]
        )
    }

    /// No movements and no income to compare with.
    private var ahorroVacio: BucketDetalle {
        BucketDetalle(
            bucket: .ahorro, periodo: sept, total: 0, porcentajeBp: nil, metaBp: 2000,
            totalTransacciones: 0, totalCategorias: 0, grupos: []
        )
    }

    private func fake() -> FakeMirachAPI {
        let api = FakeMirachAPI(periodosResult: .success([sept, agosto]))
        api.setDetalleResults([.success(necesidades)], for: .necesidades)
        api.setDetalleResults([.success(SampleData.deseosDetalle)], for: .deseos)
        api.setDetalleResults([.success(ahorroVacio)], for: .ahorro)
        return api
    }

    private func make(_ api: FakeMirachAPI, changed: @escaping @MainActor () -> Void = {}) -> MovimientosViewModel {
        MovimientosViewModel(api: api, today: sept, onChanged: changed)
    }

    private func calls(_ api: FakeMirachAPI, _ bucket: Bucket) -> Int {
        api.detalleCalls.filter { $0.bucket == bucket }.count
    }

    /// Opens the sheet of «Netflix» (t-3, Suscripciones, Gustos) in its pane and picks a category.
    private func pick(_ vm: MovimientosViewModel, _ categoryId: String, movement: MovimientoBucket? = nil) async {
        let pane = vm.pane(.deseos)
        await pane.beginReclassify(movement ?? SampleData.deseosDetalle.grupos[1].transacciones[0])
        await pane.choose(categoryId: categoryId)
    }

    // MARK: loading

    @Test func startsLoadingThenShowsTheThreePanesInOrderForTheMostRecentMonth() async {
        let api = fake()
        let vm = make(api)
        #expect(vm.state == .loading)

        await vm.load()

        #expect(vm.state == .loaded)
        #expect(vm.periodo == sept)
        #expect(vm.panes.map(\.bucket) == [.necesidades, .deseos, .ahorro])
        #expect(vm.notice == nil)
    }

    @Test func theMonthIsResolvedOnceAndTheThreeBucketsAreRequestedForIt() async {
        let api = fake()
        let vm = make(api)

        await vm.load()

        #expect(api.periodosCalls == 1)
        #expect(Set(api.detalleCalls.map(\.bucket)) == [.necesidades, .deseos, .ahorro])
        #expect(api.detalleCalls.count == 3)
        #expect(api.detalleCalls.allSatisfy { $0.periodo == sept })
    }

    @Test func aBucketWithoutMovementsKeepsItsPaneLoadedAndEmpty() async {
        let vm = make(fake())

        await vm.load()

        #expect(vm.state == .loaded)
        #expect(vm.pane(.ahorro).state == .loaded(ahorroVacio))
    }

    @Test func withoutMonthsWithDataItOpensOnTheCurrentMonth() async {
        let api = fake()
        api.setPeriodosResult(.success([]))
        let vm = make(api)

        await vm.load()

        #expect(vm.periodo == sept)
        #expect(vm.state == .loaded)
        #expect(api.detalleCalls.allSatisfy { $0.periodo == sept })
    }

    @Test func oneOfTheThreeRequestsFailingShowsTheErrorStateAndRetryAsksAgain() async {
        let api = fake()
        api.setDetalleResults([.failure(URLError(.notConnectedToInternet)), .success(SampleData.deseosDetalle)], for: .deseos)
        let vm = make(api)

        await vm.load()
        #expect(vm.state == .failed(.connection))

        await vm.retry()
        #expect(vm.state == .loaded)
        #expect(api.periodosCalls == 1, "the month is not resolved again")
        #expect(api.detalleCalls.count == 6)
    }

    @Test func aServerErrorIsAServerFailure() async {
        let api = fake()
        api.setDetalleResults([.failure(APIError.badStatus(503))], for: .ahorro)
        let vm = make(api)

        await vm.load()

        #expect(vm.state == .failed(.server))
    }

    @Test func failingToResolveTheMonthIsAnErrorAndRetryTriesAgain() async {
        let api = fake()
        api.setPeriodosResult(.failure(URLError(.timedOut)))
        let vm = make(api)

        await vm.load()
        #expect(vm.state == .failed(.connection))
        #expect(api.detalleCalls.isEmpty)

        api.setPeriodosResult(.success([sept]))
        await vm.retry()
        #expect(vm.state == .loaded)
        #expect(api.detalleCalls.count == 3)
    }

    @Test func loadIfNeededRunsOnceUnlessTheFirstOneWasCancelledOrFailedToAnswer() async {
        let api = fake()
        let vm = make(api)

        await vm.loadIfNeeded()
        await vm.loadIfNeeded()

        #expect(api.detalleCalls.count == 3)
    }

    // MARK: month

    @Test func theMonthSelectorWalksTheMonthsWithDataAndEachChangeReloadsTheThreePanes() async {
        let api = fake()
        let vm = make(api)
        await vm.load()
        #expect(vm.anterior == agosto)
        #expect(vm.siguiente == nil)

        await vm.select(agosto)

        #expect(vm.periodo == agosto)
        #expect(vm.anterior == nil)
        #expect(vm.siguiente == sept)
        #expect(api.detalleCalls.suffix(3).allSatisfy { $0.periodo == agosto })
        #expect(vm.state == .loaded)
    }

    // MARK: pull to refresh and outside changes

    @Test func pullToRefreshReadsTheThreeAgainWithoutBlankingTheScreen() async {
        let api = fake()
        let vm = make(api)
        await vm.load()

        await vm.refresh()

        #expect(vm.state == .loaded)
        #expect(api.detalleCalls.count == 6)
    }

    @Test func aFailedRefreshKeepsTheDataAndSaysSo() async {
        let api = fake()
        let vm = make(api)
        await vm.load()
        api.setDetalleResults([.failure(URLError(.notConnectedToInternet))], for: .necesidades)

        await vm.refresh()

        #expect(vm.state == .loaded)
        #expect(vm.pane(.necesidades).state == .loaded(necesidades))
        #expect(vm.displayedNotice == .failure("No se pudo actualizar la lista."))
    }

    @Test func anImportOrADeletedStatementReloadsMonthsAndPanesInPlace() async {
        let api = fake()
        let vm = make(api)
        await vm.load()

        await vm.reload()

        #expect(vm.state == .loaded)
        #expect(api.periodosCalls == 2)
        #expect(api.detalleCalls.count == 6)
    }

    @Test func aCatalogChangeReadsThePanesAgain() async {
        let api = fake()
        let vm = make(api)
        await vm.load()

        await vm.catalogDidChange()

        #expect(vm.state == .loaded)
        #expect(api.detalleCalls.count == 6)
    }

    // MARK: moving

    @Test func movingWithinTheBucketSavesWithoutAskingReloadsTheThreeAndOffersUndo() async {
        let api = fake()
        var changed = 0
        let vm = make(api) { changed += 1 }
        await vm.load()
        await pick(vm, SampleData.Cat.restaurantes)

        await vm.pane(.deseos).save()

        #expect(vm.pane(.deseos).pendingChange == nil)
        #expect(api.reclasificarCalls == [.init(transaccionId: "t-3", categoriaId: SampleData.Cat.restaurantes)])
        #expect(vm.notice == .moved("Movido a Gustos · Restaurantes", undo: .init(transaccionId: "t-3", categoriaId: "cat-susc")))
        #expect(calls(api, .necesidades) == 2 && calls(api, .deseos) == 2 && calls(api, .ahorro) == 2)
        #expect(changed == 1, "the Resumen reads again")
        #expect(vm.pane(.deseos).sheetMovement == nil)
    }

    @Test func movingToAnotherBucketAsksAboutThePanesBucketAndNothingIsSentUntilConfirmed() async {
        let api = fake()
        api.setReclasificarResults([.success(Reclasificacion(categoriaId: SampleData.Cat.supermercado, categoriaNombre: "Supermercado", bucket: .necesidades))])
        let vm = make(api)
        await vm.load()
        await pick(vm, SampleData.Cat.supermercado)

        await vm.pane(.deseos).save()

        #expect(vm.pane(.deseos).pendingChange?.category.id == SampleData.Cat.supermercado)
        #expect(api.reclasificarCalls.isEmpty)
        #expect(vm.notice == nil)

        await vm.pane(.deseos).confirmBucketChange()

        #expect(api.reclasificarCalls == [.init(transaccionId: "t-3", categoriaId: SampleData.Cat.supermercado)])
        #expect(vm.notice == .moved("Movido a Necesidades · Supermercado", undo: .init(transaccionId: "t-3", categoriaId: "cat-susc")))
        #expect(calls(api, .necesidades) == 2 && calls(api, .deseos) == 2 && calls(api, .ahorro) == 2)
    }

    @Test func aMovementInNecesidadesIsComparedWithNecesidadesNotWithTheOtherPanes() async {
        let api = fake()
        let vm = make(api)
        await vm.load()
        let pane = vm.pane(.necesidades)
        await pane.beginReclassify(necesidades.grupos[0].transacciones[0])
        await pane.choose(categoryId: SampleData.Cat.transporte)

        await pane.save()

        #expect(pane.pendingChange == nil, "Transporte is Necesidades, the movement's own bucket")
        #expect(api.reclasificarCalls.count == 1)
    }

    @Test func undoSendsTheMovementBackReloadsAndRemovesTheNotice() async {
        let api = fake()
        var changed = 0
        let vm = make(api) { changed += 1 }
        await vm.load()
        await pick(vm, SampleData.Cat.restaurantes)
        await vm.pane(.deseos).save()

        await vm.undo()

        #expect(api.reclasificarCalls.last == .init(transaccionId: "t-3", categoriaId: "cat-susc"))
        #expect(api.reclasificarCalls.count == 2)
        #expect(vm.notice == nil)
        #expect(calls(api, .necesidades) == 3 && calls(api, .deseos) == 3 && calls(api, .ahorro) == 3)
        #expect(changed == 2, "the move and the undo both reload the Resumen")
    }

    @Test func aMovementFromSinCategoriaHasNoUndo() async {
        let api = fake()
        let vm = make(api)
        await vm.load()
        await pick(vm, SampleData.Cat.restaurantes, movement: SampleData.deseosDetalle.grupos[2].transacciones[0])

        await vm.pane(.deseos).save()

        #expect(vm.notice == .moved("Movido a Gustos · Restaurantes", undo: nil))
        #expect(api.reclasificarCalls == [.init(transaccionId: "t-4", categoriaId: SampleData.Cat.restaurantes)])
    }

    @Test func aMoveAppliedToSimilarMovementsHasNoUndo() async {
        let api = fake()
        api.setParecidosResults([.success(Parecidos(patron: "netflix", total: 2, existente: nil))])
        let vm = make(api)
        await vm.load()
        await pick(vm, SampleData.Cat.restaurantes)
        vm.pane(.deseos).applyToSimilar = true

        await vm.pane(.deseos).save()

        #expect(api.reclasificarCalls == [.init(transaccionId: "t-3", categoriaId: SampleData.Cat.restaurantes, aplicarAParecidos: sept)])
        #expect(vm.notice == .moved("Movido a Gustos · Restaurantes", undo: nil))
    }

    @Test func aFailedUndoShowsAnErrorAndKeepsTheDataOnScreen() async {
        let api = fake()
        var changed = 0
        let vm = make(api) { changed += 1 }
        await vm.load()
        await pick(vm, SampleData.Cat.restaurantes)
        await vm.pane(.deseos).save()
        api.setReclasificarResults([.failure(URLError(.notConnectedToInternet))])
        let readsBefore = api.detalleCalls.count

        await vm.undo()

        #expect(vm.notice == .failure("No pudimos deshacer el movimiento. Revisa tu conexión e inténtalo de nuevo."))
        #expect(vm.state == .loaded)
        #expect(vm.pane(.deseos).state == .loaded(SampleData.deseosDetalle))
        #expect(api.detalleCalls.count == readsBefore, "nothing is read again")
        #expect(changed == 1)
    }

    @Test func aMoveThatWasNotCompletedLeavesNoNotice() async {
        let api = fake()
        api.setReclasificarResults([.failure(APIError.badStatus(500))])
        let vm = make(api)
        await vm.load()
        await pick(vm, SampleData.Cat.restaurantes)

        await vm.pane(.deseos).save()

        #expect(vm.notice == nil)
        #expect(vm.pane(.deseos).sheetNotice == "No pudimos mover el movimiento. Inténtalo de nuevo.")
    }

    @Test func changingTheMonthDropsTheNotice() async {
        let api = fake()
        let vm = make(api)
        await vm.load()
        await pick(vm, SampleData.Cat.restaurantes)
        await vm.pane(.deseos).save()

        await vm.select(agosto)

        #expect(vm.notice == nil)
    }
}
