import Foundation
import Testing
@testable import Mirach

@MainActor
struct DetalleCategoriaViewModelTests {
    private static let lider = PatronCategoria(id: "p-1", patron: "LIDER", matchType: .contains)
    private static let jumbo = PatronCategoria(id: "p-2", patron: "JUMBO", matchType: .startsWith)
    private let super_ = CategoriaCatalogo(
        id: "cat-super", nombre: "Supermercado", bucket: .necesidades, icono: "shopping-cart",
        transaccionesCount: 12, patrones: [lider, jumbo]
    )
    private let empty = CategoriaCatalogo(id: "cat-empty", nombre: "Vacía", bucket: .deseos, icono: nil, transaccionesCount: 0)
    private let system = CategoriaCatalogo(
        id: "cat-sys", nombre: "Desconocido", bucket: .deseos, icono: "circle-help", esInterna: true
    )

    private final class Recorder: @unchecked Sendable {
        var changes = 0
        var deleted: [String] = []
    }

    private func catalog(_ items: CategoriaCatalogo...) -> Result<CatalogoCategorias, any Error> {
        .success(CatalogoCategorias(categorias: items))
    }

    private func make(
        _ api: FakeMirachAPI, id: String = "cat-super", recorder: Recorder = Recorder()
    ) -> DetalleCategoriaViewModel {
        DetalleCategoriaViewModel(
            api: api, categoriaId: id, onChange: { recorder.changes += 1 }, onDeleted: { recorder.deleted.append($0) },
            previewDelay: .zero
        )
    }

    private func loaded(_ api: FakeMirachAPI = FakeMirachAPI(), id: String = "cat-super", recorder: Recorder = Recorder()) async -> DetalleCategoriaViewModel {
        api.setCategoriasResults([catalog(super_, empty, system)])
        let viewModel = make(api, id: id, recorder: recorder)
        await viewModel.load()
        return viewModel
    }

    // MARK: loading

    @Test func findsTheCategoryByIdInTheCatalogAndFillsTheForm() async {
        let viewModel = await loaded()

        #expect(viewModel.state == .loaded(super_))
        #expect(viewModel.draftNombre == "Supermercado")
        #expect(viewModel.draftBucket == .necesidades)
        #expect(viewModel.draftIcono == "shopping-cart")
        #expect(!viewModel.hasChanges)
    }

    @Test func aCategoryThatIsNotInTheCatalogIsGone() async {
        let viewModel = await loaded(id: "nope")

        #expect(viewModel.state == .notFound)
    }

    @Test func aNetworkErrorIsAConnectionFailureAndRetryAsksAgain() async {
        let api = FakeMirachAPI()
        api.setCategoriasResults([.failure(URLError(.notConnectedToInternet)), catalog(super_)])
        let viewModel = make(api)

        await viewModel.load()
        #expect(viewModel.state == .failed(.connection))

        await viewModel.retry()
        #expect(viewModel.state == .loaded(super_))
    }

    @Test func cancellationAndAnExpiredSessionShowNoError() async {
        for error: any Error in [CancellationError(), URLError(.cancelled), APIError.sessionExpired] {
            let api = FakeMirachAPI()
            api.setCategoriasResults([.failure(error)])
            let viewModel = make(api)
            await viewModel.load()
            #expect(viewModel.state == .loading)
        }
    }

    @Test func aLateAnswerFromAnOlderRequestDoesNotOverwriteTheNewerOne() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        let gate = Gate()
        api.categoriasGate = gate
        api.setCategoriasResults([catalog(empty), catalog(super_)])

        let first = Task { await viewModel.refresh() }
        await gate.waitUntilWaiting()
        api.categoriasGate = nil
        await viewModel.refresh()
        await gate.open()
        await first.value

        #expect(viewModel.state == .loaded(super_))
    }

    @Test func aLoadCancelledBeforeItFinishedRunsAgainOnTheNextAppearance() async {
        let api = FakeMirachAPI()
        api.setCategoriasResults([.failure(CancellationError()), catalog(super_)])
        let viewModel = make(api)

        await viewModel.loadIfNeeded()
        #expect(viewModel.state == .loading)
        await viewModel.loadIfNeeded()
        #expect(viewModel.state == .loaded(super_))
        await viewModel.loadIfNeeded()
        #expect(api.categoriasCalls == 2, "appearing again must not reload")
    }

    @Test func anInitialLoadSupersededByARefreshStillMarksTheScreenLoaded() async {
        let api = FakeMirachAPI()
        api.setCategoriasResults([catalog(super_)])
        let viewModel = make(api)
        let gate = Gate()
        api.categoriasGate = gate

        let initial = Task { await viewModel.loadIfNeeded() }
        await gate.waitUntilWaiting()
        api.categoriasGate = nil
        await viewModel.refresh()
        await gate.open()
        await initial.value
        await viewModel.loadIfNeeded()

        #expect(api.categoriasCalls == 2)
    }

    @Test func aFailedRefreshKeepsTheScreenAndSaysSo() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        api.setCategoriasResults([.failure(URLError(.timedOut))])

        await viewModel.refresh()

        #expect(viewModel.state == .loaded(super_))
        #expect(viewModel.refreshNotice == "No se pudo actualizar la categoría.")
    }

    @Test func refreshingKeepsWhatThePersonIsTyping() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        viewModel.draftNombre = "Super"
        api.setCategoriasResults([catalog(super_)])

        await viewModel.refresh()

        #expect(viewModel.draftNombre == "Super")
    }

    // MARK: system category

    @Test func aSystemCategoryIsProtectedFromTheStart() async {
        let viewModel = await loaded(id: "cat-sys")

        #expect(viewModel.isProtected)
        #expect(viewModel.protectedMessage == "Esta categoría es del sistema y no se puede editar ni eliminar")
    }

    @Test func aProtectedCategoryNeverSendsAnything() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api, id: "cat-sys")
        viewModel.draftNombre = "Otra"

        await viewModel.save()
        viewModel.requestDeletion()
        await viewModel.confirmDeletion()

        #expect(api.actualizarCategoriaCalls.isEmpty)
        #expect(api.eliminarCategoriaCalls.isEmpty)
        #expect(!viewModel.pendingDeletion)
    }

    @Test func a403WhileSavingProtectsTheScreenUntilItIsLeft() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        api.setActualizarCategoriaResults([.failure(CategoriaError.isInternal)])
        viewModel.draftNombre = "Otra"

        await viewModel.save()

        #expect(viewModel.isProtected)
        #expect(viewModel.fieldErrors.general == "Esta categoría es del sistema y no se puede editar ni eliminar")
    }

    // MARK: editing

    @Test func savingSendsOnlyTheFieldsThatChangedAndByTheCategoryId() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        api.setActualizarCategoriaResults([.success(CategoriaCatalogo(id: "cat-super", nombre: "Súper", bucket: .necesidades, icono: "shopping-cart"))])
        viewModel.draftNombre = "  Súper  "

        await viewModel.save()

        #expect(api.actualizarCategoriaCalls == [.init(id: "cat-super", cambios: CategoriaCambios(nombre: "Súper"))])
    }

    @Test func aChangedIconIsSentAloneAndTheNameIsLeftOut() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        viewModel.draftIcono = "gift"

        await viewModel.save()

        #expect(api.actualizarCategoriaCalls.map(\.cambios) == [CategoriaCambios(icono: "gift")])
    }

    @Test func noChangesMeansNothingIsSent() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        viewModel.draftNombre = "Supermercado "   // trims back to the same name

        await viewModel.save()

        #expect(!viewModel.hasChanges)
        #expect(api.actualizarCategoriaCalls.isEmpty)
    }

    @Test func aSuccessfulSaveShowsTheServersAnswerAnnouncesItAndTellsTheOtherScreens() async {
        let api = FakeMirachAPI()
        let recorder = Recorder()
        let viewModel = await loaded(api, recorder: recorder)
        let answer = CategoriaCatalogo(
            id: "cat-super", nombre: "Súper", bucket: .necesidades, icono: "shopping-cart",
            transaccionesCount: 12, patrones: [Self.lider, Self.jumbo]
        )
        api.setActualizarCategoriaResults([.success(answer)])
        viewModel.draftNombre = "Súper"

        await viewModel.save()

        #expect(viewModel.state == .loaded(answer))
        #expect(viewModel.announcement == "Categoría guardada")
        #expect(!viewModel.hasChanges)
        #expect(recorder.changes == 1)
    }

    @Test(arguments: [
        (CategoriaError.invalidName, "name", "El nombre debe tener entre 1 y 40 caracteres"),
        (CategoriaError.duplicateName, "name", "Ya tienes una categoría con ese nombre"),
        (CategoriaError.bucketNotAssignable, "bucket", "Elige un grupo: Necesidades, Gustos o Ahorro"),
        (CategoriaError.invalidIcon, "icon", "Elige un ícono válido de la lista"),
        (CategoriaError.rejected(message: "Otra cosa"), "general", "Otra cosa"),
    ] as [(CategoriaError, String, String)])
    func eachRejectionLandsOnItsControlAndWhatWasTypedStays(error: CategoriaError, field: String, text: String) async {
        let api = FakeMirachAPI()
        let recorder = Recorder()
        let viewModel = await loaded(api, recorder: recorder)
        api.setActualizarCategoriaResults([.failure(error)])
        viewModel.draftNombre = "Otra"

        await viewModel.save()

        let shown: String? = switch field {
        case "name": viewModel.fieldErrors.name
        case "bucket": viewModel.fieldErrors.bucket
        case "icon": viewModel.fieldErrors.icon
        default: viewModel.fieldErrors.general
        }
        #expect(shown == text)
        #expect(viewModel.draftNombre == "Otra")
        #expect(viewModel.state == .loaded(super_), "nothing changed on screen")
        #expect(recorder.changes == 0)
        #expect(viewModel.announcement == nil)
    }

    @Test func aMissingCategoryWhileSavingSaysSoAndTellsTheOtherScreens() async {
        let api = FakeMirachAPI()
        let recorder = Recorder()
        let viewModel = await loaded(api, recorder: recorder)
        api.setActualizarCategoriaResults([.failure(CategoriaError.notFound)])
        viewModel.draftNombre = "Otra"

        await viewModel.save()

        #expect(viewModel.state == .notFound)
        #expect(recorder.changes == 1, "the lists still show it")
    }

    @Test func aConnectionFailureWhileSavingKeepsTheDraftWithAGeneralMessage() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        api.setActualizarCategoriaResults([.failure(URLError(.notConnectedToInternet))])
        viewModel.draftNombre = "Otra"

        await viewModel.save()

        #expect(viewModel.fieldErrors.general == "No pudimos guardar los cambios. Revisa tu conexión e inténtalo de nuevo.")
        #expect(viewModel.draftNombre == "Otra")
        #expect(!viewModel.isSaving)
    }

    @Test func anExpiredSessionWhileSavingShowsNoError() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        api.setActualizarCategoriaResults([.failure(APIError.sessionExpired)])
        viewModel.draftNombre = "Otra"

        await viewModel.save()

        #expect(viewModel.fieldErrors.isEmpty)
    }

    @Test func whileSavingASecondSaveIsIgnored() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        let gate = Gate()
        api.catalogWriteGate = gate
        viewModel.draftNombre = "Otra"

        let first = Task { await viewModel.save() }
        await gate.waitUntilWaiting()
        #expect(viewModel.isSaving)
        await viewModel.save()
        await gate.open()
        await first.value

        #expect(api.actualizarCategoriaCalls.count == 1)
    }

    // MARK: changing bucket

    @Test func movingToAnotherBucketAsksFirstAndNamesTheMovements() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        viewModel.draftBucket = .ahorro

        await viewModel.save()

        #expect(api.actualizarCategoriaCalls.isEmpty, "nothing is sent until the person confirms")
        #expect(viewModel.pendingBucketChange == .init(count: 12, from: .necesidades, to: .ahorro))
    }

    @Test func confirmingTheBucketChangeSendsTheBucketNameOnly() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        viewModel.draftBucket = .ahorro
        await viewModel.save()

        await viewModel.confirmBucketChange()

        #expect(api.actualizarCategoriaCalls.map(\.cambios) == [CategoriaCambios(bucket: .ahorro)])
        #expect(viewModel.pendingBucketChange == nil)
    }

    @Test func cancellingTheBucketChangeSendsNothingAndKeepsTheDraft() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        viewModel.draftBucket = .ahorro
        await viewModel.save()

        viewModel.cancelBucketChange()

        #expect(viewModel.pendingBucketChange == nil)
        #expect(api.actualizarCategoriaCalls.isEmpty)
        #expect(viewModel.draftBucket == .ahorro)
    }

    @Test func aCategoryWithNoMovementsStillAsksBeforeChangingBucket() async {
        // ADR-038: the zero case softens the sentence, it does not skip the confirmation.
        let api = FakeMirachAPI()
        let viewModel = await loaded(api, id: "cat-empty")
        viewModel.draftBucket = .ahorro

        await viewModel.save()

        #expect(api.actualizarCategoriaCalls.isEmpty)
        #expect(viewModel.pendingBucketChange == .init(count: 0, from: .deseos, to: .ahorro))
    }

    @Test func aNameChangeAloneNeverAsksForTheBucketConfirmation() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        viewModel.draftNombre = "Otra"

        await viewModel.save()

        #expect(viewModel.pendingBucketChange == nil)
        #expect(api.actualizarCategoriaCalls.count == 1)
    }

    @Test func aNameAndABucketChangeTogetherAreSentTogetherAfterConfirming() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        viewModel.draftNombre = "Otra"
        viewModel.draftBucket = .deseos
        await viewModel.save()

        await viewModel.confirmBucketChange()

        #expect(api.actualizarCategoriaCalls.map(\.cambios) == [CategoriaCambios(nombre: "Otra", bucket: .deseos)])
    }

    // MARK: deleting the category

    @Test func askingToDeleteOnlyAsksAndCancellingChangesNothing() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)

        viewModel.requestDeletion()
        #expect(viewModel.pendingDeletion)
        #expect(api.eliminarCategoriaCalls.isEmpty)

        viewModel.cancelDeletion()
        #expect(!viewModel.pendingDeletion)
        await viewModel.confirmDeletion()
        #expect(api.eliminarCategoriaCalls.isEmpty, "confirming without having asked cannot delete")
    }

    @Test func confirmingDeletesByIdTellsTheOtherScreensAndLeaves() async {
        let api = FakeMirachAPI()
        let recorder = Recorder()
        let viewModel = await loaded(api, recorder: recorder)
        viewModel.requestDeletion()

        await viewModel.confirmDeletion()

        #expect(api.eliminarCategoriaCalls == ["cat-super"])
        #expect(viewModel.isGone)
        #expect(recorder.changes == 1)
        #expect(recorder.deleted == ["Supermercado"])
    }

    @Test func aMissingCategoryWhileDeletingCountsAsDeletedAndTheListIsRefreshed() async {
        let api = FakeMirachAPI()
        let recorder = Recorder()
        let viewModel = await loaded(api, recorder: recorder)
        api.setEliminarCategoriaResults([.failure(CategoriaError.notFound)])
        viewModel.requestDeletion()

        await viewModel.confirmDeletion()

        #expect(viewModel.isGone)
        #expect(recorder.changes == 1)
        #expect(recorder.deleted.isEmpty, "it was not this screen that deleted it")
    }

    @Test func aFailedDeletionKeepsTheCategoryAndSaysSo() async {
        let api = FakeMirachAPI()
        let recorder = Recorder()
        let viewModel = await loaded(api, recorder: recorder)
        api.setEliminarCategoriaResults([.failure(URLError(.notConnectedToInternet))])
        viewModel.requestDeletion()

        await viewModel.confirmDeletion()

        #expect(!viewModel.isGone)
        #expect(viewModel.notice == "No pudimos eliminar la categoría. Revisa tu conexión e inténtalo de nuevo.")
        #expect(recorder.changes == 0)
    }

    @Test func aSystemCategoryRefusedWith403WhileDeletingBecomesProtected() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        api.setEliminarCategoriaResults([.failure(CategoriaError.isInternal)])
        viewModel.requestDeletion()

        await viewModel.confirmDeletion()

        #expect(viewModel.isProtected)
        #expect(!viewModel.isGone)
    }

    @Test func whileDeletingASecondConfirmationIsIgnored() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        let gate = Gate()
        api.catalogWriteGate = gate
        viewModel.requestDeletion()

        let first = Task { await viewModel.confirmDeletion() }
        await gate.waitUntilWaiting()
        #expect(viewModel.isDeleting)
        viewModel.requestDeletion()
        await viewModel.confirmDeletion()
        await gate.open()
        await first.value

        #expect(api.eliminarCategoriaCalls.count == 1)
    }

    // MARK: patterns

    @Test func addingAPatternSendsTheCategoryIdAndTheTrimmedTextAsContainsThenListsIt() async {
        let api = FakeMirachAPI()
        let recorder = Recorder()
        let viewModel = await loaded(api, recorder: recorder)
        let created = PatronCategoria(id: "p-9", patron: "UNIMARC", matchType: .contains)
        api.setCrearPatronResults([.success(created)])
        viewModel.beginAddPattern()

        await viewModel.savePattern(text: "  UNIMARC ")

        // CLA-14: there is no picker; a new pattern is always «contains» and moves nothing.
        #expect(api.crearPatronCalls == [.init(categoriaId: "cat-super", patron: "UNIMARC", matchType: .contains, moverDelPeriodo: nil)])
        guard case .loaded(let category) = viewModel.state else { Issue.record("not loaded"); return }
        #expect(category.patrones.map(\.id) == ["p-1", "p-2", "p-9"])
        #expect(viewModel.patternSheet == nil, "the sheet closes")
        #expect(viewModel.announcement == "Patrón guardado")
        #expect(recorder.changes == 1)
    }

    @Test func editingAPatternSendsOnlyTheTextAndReplacesTheRow() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        let updated = PatronCategoria(id: "p-2", patron: "JUMBO CL", matchType: .startsWith)
        api.setActualizarPatronResults([.success(updated)])
        viewModel.beginEditPattern(Self.jumbo)

        await viewModel.savePattern(text: "JUMBO CL")

        // The plain PATCH of the text: the pattern keeps its own type and never previews.
        #expect(api.actualizarPatronCalls == [.init(id: "p-2", cambios: PatronCambios(patron: "JUMBO CL"))])
        #expect(api.crearPatronCalls.isEmpty)
        guard case .loaded(let category) = viewModel.state else { Issue.record("not loaded"); return }
        #expect(category.patrones.first { $0.id == "p-2" } == updated)
    }

    @Test func editingAPatternWithoutChangesJustClosesTheSheet() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        viewModel.beginEditPattern(Self.lider)

        await viewModel.savePattern(text: "LIDER ")

        #expect(api.actualizarPatronCalls.isEmpty)
        #expect(viewModel.patternSheet == nil)
    }

    @Test(arguments: [
        (PatronError.invalidPattern, "Escribe un texto válido para el patrón (de 1 a 200 caracteres)"),
        (PatronError.invalidRegex, "Esa expresión regular no es válida"),
        (PatronError.duplicate, "Ya tienes un patrón con ese texto"),
        (PatronError.invalidMatchType, "Ese tipo de coincidencia no es válido"),
        (PatronError.rejected(message: "Otra cosa"), "Otra cosa"),
    ] as [(PatronError, String)])
    func eachPatternRejectionShowsItsMessageInTheSheetAndKeepsItOpen(error: PatronError, text: String) async {
        let api = FakeMirachAPI()
        let recorder = Recorder()
        let viewModel = await loaded(api, recorder: recorder)
        api.setCrearPatronResults([.failure(error)])
        viewModel.beginAddPattern()

        await viewModel.savePattern(text: "x")

        #expect(viewModel.patternErrors.pattern == text || viewModel.patternErrors.general == text)
        #expect(viewModel.patternSheet == .adding)
        #expect(viewModel.state == .loaded(super_))
        #expect(recorder.changes == 0)
    }

    @Test func aMissingCategoryWhileAddingAPatternSendsThePersonBackToGone() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        api.setCrearPatronResults([.failure(PatronError.categoryNotFound)])
        viewModel.beginAddPattern()

        await viewModel.savePattern(text: "x")

        #expect(viewModel.state == .notFound)
        #expect(viewModel.patternSheet == nil)
    }

    @Test func aMissingPatternWhileEditingRemovesItFromTheListAndSaysSo() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        api.setActualizarPatronResults([.failure(PatronError.patternNotFound)])
        viewModel.beginEditPattern(Self.lider)

        await viewModel.savePattern(text: "OTRO")

        guard case .loaded(let category) = viewModel.state else { Issue.record("not loaded"); return }
        #expect(category.patrones.map(\.id) == ["p-2"])
        #expect(viewModel.notice == "Ese patrón ya no existe")
        #expect(viewModel.patternSheet == nil)
    }

    @Test func whileSavingAPatternASecondSaveIsIgnored() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        let gate = Gate()
        api.catalogWriteGate = gate
        viewModel.beginAddPattern()

        let first = Task { await viewModel.savePattern(text: "x") }
        await gate.waitUntilWaiting()
        #expect(viewModel.isSavingPattern)
        await viewModel.savePattern(text: "x")
        await gate.open()
        await first.value

        #expect(api.crearPatronCalls.count == 1)
    }

    @Test func deletingAPatternAsksFirstThenDeletesByIdAndAnnounces() async {
        let api = FakeMirachAPI()
        let recorder = Recorder()
        let viewModel = await loaded(api, recorder: recorder)

        viewModel.requestPatternDeletion(Self.lider)
        #expect(viewModel.pendingPatternDeletion == Self.lider)
        #expect(api.eliminarPatronCalls.isEmpty)
        await viewModel.confirmPatternDeletion()

        #expect(api.eliminarPatronCalls == ["p-1"])
        guard case .loaded(let category) = viewModel.state else { Issue.record("not loaded"); return }
        #expect(category.patrones.map(\.id) == ["p-2"])
        #expect(viewModel.announcement == "Patrón eliminado")
        #expect(recorder.changes == 1)
    }

    @Test func cancellingAPatternDeletionDeletesNothing() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        viewModel.requestPatternDeletion(Self.lider)

        viewModel.cancelPatternDeletion()
        await viewModel.confirmPatternDeletion()

        #expect(api.eliminarPatronCalls.isEmpty)
    }

    @Test func aMissingPatternWhileDeletingIsRemovedFromTheList() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        api.setEliminarPatronResults([.failure(PatronError.patternNotFound)])
        viewModel.requestPatternDeletion(Self.lider)

        await viewModel.confirmPatternDeletion()

        guard case .loaded(let category) = viewModel.state else { Issue.record("not loaded"); return }
        #expect(category.patrones.map(\.id) == ["p-2"])
    }

    @Test func aFailedPatternDeletionKeepsTheRowAndSaysSo() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        api.setEliminarPatronResults([.failure(URLError(.timedOut))])
        viewModel.requestPatternDeletion(Self.lider)

        await viewModel.confirmPatternDeletion()

        guard case .loaded(let category) = viewModel.state else { Issue.record("not loaded"); return }
        #expect(category.patrones.count == 2)
        #expect(viewModel.notice == "No pudimos eliminar el patrón. Revisa tu conexión e inténtalo de nuevo.")
    }

    // MARK: leaving with unsaved changes

    @Test func leavingWithUnsavedChangesAsksAndDiscardingRestoresTheForm() async {
        let viewModel = await loaded()
        viewModel.draftNombre = "Otra"
        viewModel.draftIcono = "gift"

        #expect(viewModel.hasChanges)
        viewModel.askToDiscard()
        #expect(viewModel.pendingDiscard)
        viewModel.discardChanges()

        #expect(!viewModel.pendingDiscard)
        #expect(viewModel.draftNombre == "Supermercado")
        #expect(viewModel.draftIcono == "shopping-cart")
    }

    @Test func leavingWithNoChangesNeverAsks() async {
        let viewModel = await loaded()

        viewModel.askToDiscard()

        #expect(!viewModel.pendingDiscard)
    }

    @Test func keepingEditingKeepsTheDraft() async {
        let viewModel = await loaded()
        viewModel.draftNombre = "Otra"
        viewModel.askToDiscard()

        viewModel.cancelDiscard()

        #expect(!viewModel.pendingDiscard)
        #expect(viewModel.draftNombre == "Otra")
    }

    // MARK: the words

    @Test func theBucketChangeSentenceNamesTheMovementsAndSoftensTheZeroCase() {
        #expect(DetalleCategoriaPresentation.bucketChange(.init(count: 12, from: .deseos, to: .necesidades))
            == "12 movimientos pasarán de Gustos a Necesidades en todos los meses.")
        #expect(DetalleCategoriaPresentation.bucketChange(.init(count: 1, from: .deseos, to: .ahorro))
            == "1 movimiento pasará de Gustos a Ahorro en todos los meses.")
        #expect(DetalleCategoriaPresentation.bucketChange(.init(count: 0, from: .deseos, to: .ahorro))
            == "Esta categoría todavía no tiene movimientos. Pasará de Gustos a Ahorro.")
    }

    @Test func theDeletionSentenceNamesWhereTheMovementsGoAndWhatElseIsRemoved() {
        #expect(DetalleCategoriaPresentation.deletion(super_)
            == "Sus 12 movimientos pasarán a «Desconocido» de Necesidades. También se eliminarán sus 2 patrones. Esta acción no se puede deshacer.")
        let one = CategoriaCatalogo(
            id: "x", nombre: "X", bucket: .deseos, transaccionesCount: 1,
            patrones: [PatronCategoria(id: "p", patron: "a", matchType: .contains)]
        )
        #expect(DetalleCategoriaPresentation.deletion(one)
            == "Su movimiento pasará a «Desconocido» de Gustos. También se eliminará su patrón. Esta acción no se puede deshacer.")
        #expect(DetalleCategoriaPresentation.deletion(empty) == "No tiene movimientos. Esta acción no se puede deshacer.")
    }

    @Test func theThreeMatchTypesHaveTheirOwnLabelNotTheInternalValue() {
        #expect([MatchType.contains, .startsWith, .regex].map(\.label) == ["Contiene", "Empieza con", "Expresión regular"])
    }

    @Test func changingOnlyTheTextOfAnUnknownTypePatternNeverSendsAMatchType() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        let odd = PatronCategoria(id: "p-odd", patron: "HBO", matchType: .other("ENDS_WITH"))
        api.setActualizarPatronResults([.success(PatronCategoria(id: "p-odd", patron: "HBO MAX", matchType: .other("ENDS_WITH")))])
        viewModel.beginEditPattern(odd)

        await viewModel.savePattern(text: "HBO MAX")

        #expect(api.actualizarPatronCalls == [.init(id: "p-odd", cambios: PatronCambios(patron: "HBO MAX"))])
    }

    // MARK: new pattern preview (CLA-15, Figma 28)

    private func preview(
        total: Int, existente: PatronExistente? = nil, periodo: String = "2026-10"
    ) -> VistaPreviaPatron {
        let rows = (0..<total).map {
            CoincidenciaPatron(id: "t-\($0)", descripcion: "SUPER ACUENTA", fecha: SampleData.date(day: $0), monto: 32_400)
        }
        return VistaPreviaPatron(periodo: Periodo(periodo)!, patron: "acuenta", total: total, coincidencias: rows, existente: existente)
    }

    @Test func typingANewPatternAsksForThePreviewOfThisCategoryWithoutAMonth() async {
        let api = FakeMirachAPI()
        api.setVistaPreviaResults([.success(preview(total: 3))])
        let viewModel = await loaded(api)
        viewModel.beginAddPattern()

        await viewModel.previewPattern("  acuenta ")

        #expect(api.vistaPreviaCalls == [.init(categoriaId: "cat-super", patron: "acuenta")])
        #expect(viewModel.patternPreview == preview(total: 3))
        #expect(viewModel.moveMatches == false, "off until the person marks it (CLA-15)")
    }

    @Test func anEmptyTextAsksNothingAndClearsThePreview() async {
        let api = FakeMirachAPI()
        api.setVistaPreviaResults([.success(preview(total: 3))])
        let viewModel = await loaded(api)
        viewModel.beginAddPattern()
        await viewModel.previewPattern("acuenta")

        await viewModel.previewPattern("  ")

        #expect(api.vistaPreviaCalls.count == 1)
        #expect(viewModel.patternPreview == nil)
    }

    @Test func editingAPatternNeverAsksForAPreview() async {
        let api = FakeMirachAPI()
        let viewModel = await loaded(api)
        viewModel.beginEditPattern(Self.lider)

        await viewModel.previewPattern("LIDER EXPRESS")

        #expect(api.vistaPreviaCalls.isEmpty)
    }

    @Test func theMoveCheckboxIsOfferedOnlyWhenSomethingCoincides() async {
        let api = FakeMirachAPI()
        api.setVistaPreviaResults([.success(preview(total: 0)), .success(preview(total: 2))])
        let viewModel = await loaded(api)
        viewModel.beginAddPattern()

        await viewModel.previewPattern("acuenta")
        #expect(viewModel.offersMoveMatches == false)
        await viewModel.previewPattern("acuenta ñuñoa")
        #expect(viewModel.offersMoveMatches == true)
    }

    @Test func savingWithTheCheckboxOnMovesThePreviewedMonthAndSaysHowMany() async {
        let api = FakeMirachAPI()
        let recorder = Recorder()
        api.setVistaPreviaResults([.success(preview(total: 3))])
        api.setCrearPatronResults([.success(PatronCategoria(id: "p-9", patron: "acuenta", matchType: .contains))])
        api.setCrearPatronMovidos(3)
        let viewModel = await loaded(api, recorder: recorder)
        viewModel.beginAddPattern()
        await viewModel.previewPattern("acuenta")

        viewModel.moveMatches = true
        await viewModel.savePattern(text: "acuenta")

        #expect(api.crearPatronCalls == [.init(
            categoriaId: "cat-super", patron: "acuenta", matchType: .contains, moverDelPeriodo: Periodo("2026-10")!
        )])
        #expect(viewModel.patternSheet == nil)
        #expect(viewModel.announcement == "Patrón guardado · 3 movidos")
        #expect(recorder.changes == 1)
    }

    @Test func savingWithTheCheckboxOffMovesNothing() async {
        let api = FakeMirachAPI()
        api.setVistaPreviaResults([.success(preview(total: 3))])
        let viewModel = await loaded(api)
        viewModel.beginAddPattern()
        await viewModel.previewPattern("acuenta")

        await viewModel.savePattern(text: "acuenta")

        #expect(api.crearPatronCalls.map(\.moverDelPeriodo) == [nil])
        #expect(viewModel.announcement == "Patrón guardado")
    }

    @Test func aFailedPreviewHidesItAndSavingStillWorks() async {
        let api = FakeMirachAPI()
        api.setVistaPreviaResults([.failure(URLError(.notConnectedToInternet))])
        let viewModel = await loaded(api)
        viewModel.beginAddPattern()
        await viewModel.previewPattern("acuenta")
        #expect(viewModel.patternPreview == nil)

        viewModel.moveMatches = true
        await viewModel.savePattern(text: "acuenta")

        #expect(api.crearPatronCalls.map(\.moverDelPeriodo) == [nil], "no preview, no month to move")
    }

    // MARK: a text that lives in another category (CLA-17, Figma 30)

    private let elsewhere = PatronExistente(patronId: "p-77", categoriaId: "cat-empty", categoria: "Vacía", bucket: .deseos)

    @Test func aPreviewNamingAnotherCategoryBecomesTheConflict() async {
        let api = FakeMirachAPI()
        api.setVistaPreviaResults([.success(preview(total: 1, existente: elsewhere))])
        let viewModel = await loaded(api)
        viewModel.beginAddPattern()

        await viewModel.previewPattern("unimarc")

        #expect(viewModel.patternConflict == .init(texto: "unimarc", existente: elsewhere))
        #expect(viewModel.offersMoveMatches == false, "the conflict replaces the preview")
    }

    @Test func aPreviewNamingThisCategoryIsNoConflict() async {
        let api = FakeMirachAPI()
        let here = PatronExistente(patronId: "p-1", categoriaId: "cat-super", categoria: "Supermercado", bucket: .necesidades)
        api.setVistaPreviaResults([.success(preview(total: 0, existente: here))])
        let viewModel = await loaded(api)
        viewModel.beginAddPattern()

        await viewModel.previewPattern("lider")

        #expect(viewModel.patternConflict == nil)
    }

    @Test func aDuplicateNamingAnotherCategoryOnSaveBecomesTheConflict() async {
        let api = FakeMirachAPI()
        api.setCrearPatronResults([.failure(PatronError.duplicateOf(elsewhere))])
        let viewModel = await loaded(api)
        viewModel.beginAddPattern()

        await viewModel.savePattern(text: "unimarc")

        #expect(viewModel.patternConflict == .init(texto: "unimarc", existente: elsewhere))
        #expect(viewModel.patternSheet == .adding)
        #expect(viewModel.patternErrors.isEmpty)
    }

    @Test func aDuplicateInThisCategoryKeepsTheDuplicateMessage() async {
        let api = FakeMirachAPI()
        let here = PatronExistente(patronId: "p-1", categoriaId: "cat-super", categoria: "Supermercado", bucket: .necesidades)
        api.setCrearPatronResults([.failure(PatronError.duplicateOf(here))])
        let viewModel = await loaded(api)
        viewModel.beginAddPattern()

        await viewModel.savePattern(text: "lider")

        #expect(viewModel.patternConflict == nil)
        #expect(viewModel.patternErrors.pattern == "Ya tienes un patrón con ese texto")
    }

    @Test func movingItHerePatchesThePatternWithThisCategoryAndListsIt() async {
        let api = FakeMirachAPI()
        let recorder = Recorder()
        api.setVistaPreviaResults([.success(preview(total: 0, existente: elsewhere))])
        let moved = PatronCategoria(id: "p-77", patron: "unimarc", matchType: .contains)
        api.setActualizarPatronResults([.success(moved)])
        let viewModel = await loaded(api, recorder: recorder)
        viewModel.beginAddPattern()
        await viewModel.previewPattern("unimarc")

        await viewModel.movePatternHere()

        #expect(api.actualizarPatronCalls == [.init(id: "p-77", cambios: PatronCambios(categoriaId: "cat-super"))])
        #expect(api.crearPatronCalls.isEmpty)
        guard case .loaded(let category) = viewModel.state else { Issue.record("not loaded"); return }
        #expect(category.patrones.map(\.id) == ["p-1", "p-2", "p-77"])
        #expect(viewModel.patternSheet == nil)
        #expect(viewModel.patternConflict == nil)
        #expect(recorder.changes == 1)
    }

    @Test func theConflictsCopyNamesBothCategoriesAndBuckets() {
        let conflict = DetalleCategoriaViewModel.PatternConflict(
            texto: "unimarc",
            existente: PatronExistente(patronId: "p", categoriaId: "c", categoria: "Supermercado", bucket: .necesidades)
        )
        let here = CategoriaCatalogo(id: "h", nombre: "Supermercado", bucket: .deseos, icono: nil, transaccionesCount: 0)

        #expect(DetalleCategoriaPresentation.conflictTitle(conflict) == "«unimarc» ya está en Supermercado (Necesidades)")
        #expect(DetalleCategoriaPresentation.conflictRule == "Un texto solo puede estar en una categoría.")
        #expect(DetalleCategoriaPresentation.conflictConsequence(conflict, here: here)
            == "Si lo mueves aquí, los próximos movimientos con «unimarc» contarán como gustos.")
        #expect(DetalleCategoriaPresentation.moveHere(here) == "Moverlo a Supermercado (Gustos)")
    }

    @Test func thePreviewCopyCountsTheMonthsMovementsAndListsThem() {
        let row = CoincidenciaPatron(id: "t", descripcion: "SUPER ACUENTA ÑUÑOA", fecha: SampleData.date(day: 11), monto: 32_400)

        #expect(DetalleCategoriaPresentation.previewTitle(total: 3, periodo: Periodo("2026-10")!)
            == "Coincide con 3 movimientos de octubre")
        #expect(DetalleCategoriaPresentation.previewTitle(total: 1, periodo: Periodo("2026-10")!)
            == "Coincide con 1 movimiento de octubre")
        #expect(DetalleCategoriaPresentation.previewRow(row) == "SUPER ACUENTA ÑUÑOA · 14 oct · -$32.400")
        #expect(DetalleCategoriaPresentation.moveMatchesTitle(total: 3, categoria: "Supermercado")
            == "Mover también estos 3 movimientos a Supermercado")
        #expect(DetalleCategoriaPresentation.moveMatchesNote
            == "Los que cambiaste a mano no se mueven. Las próximas cartolas usan el patrón siempre.")
    }
}
