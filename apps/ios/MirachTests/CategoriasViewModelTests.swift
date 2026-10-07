import Foundation
import Testing
@testable import Mirach

@MainActor
struct CategoriasViewModelTests {
    private let created = CategoriaCatalogo(id: "cat-new", nombre: "Mascotas", bucket: .deseos, icono: "paw-print")

    private final class Changes: @unchecked Sendable {
        var count = 0
    }

    private func make(
        _ api: FakeMirachAPI = FakeMirachAPI(), changes: Changes = Changes()
    ) -> CategoriasViewModel {
        CategoriasViewModel(api: api, onChange: { changes.count += 1 })
    }

    private func loadedCatalog(_ viewModel: CategoriasViewModel) -> CatalogoCategorias? {
        if case .loaded(let catalog) = viewModel.state { catalog } else { nil }
    }

    // MARK: loading

    @Test func startsLoadingThenShowsTheCatalog() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        #expect(viewModel.state == .loading)

        await viewModel.load()

        #expect(viewModel.state == .loaded(SampleData.catalog))
        #expect(api.categoriasCalls == 1)
    }

    @Test func theThreeBucketsAlwaysAppearEvenWithNoCategories() async {
        let api = FakeMirachAPI()
        api.setCategoriasResults([.success(CatalogoCategorias(categorias: []))])
        let viewModel = make(api)

        await viewModel.load()

        let catalog = try? #require(loadedCatalog(viewModel))
        #expect(catalog?.groups.map(\.bucket) == [.necesidades, .deseos, .ahorro])
        #expect(catalog?.groups.allSatisfy { $0.categorias.isEmpty } == true)
    }

    @Test func aNetworkErrorIsAConnectionFailureAndRetryAsksAgain() async {
        let api = FakeMirachAPI()
        api.setCategoriasResults([.failure(URLError(.notConnectedToInternet)), .success(SampleData.catalog)])
        let viewModel = make(api)

        await viewModel.load()
        #expect(viewModel.state == .failed(.connection))

        await viewModel.retry()
        #expect(viewModel.state == .loaded(SampleData.catalog))
    }

    @Test func serverAndDecodingProblemsAreServerFailures() async {
        for error: any Error in [APIError.badStatus(503), DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: ""))] {
            let api = FakeMirachAPI()
            api.setCategoriasResults([.failure(error)])
            let viewModel = make(api)
            await viewModel.load()
            #expect(viewModel.state == .failed(.server))
        }
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

    // MARK: stale answers and appearing again

    @Test func aLateAnswerFromAnOlderRequestDoesNotOverwriteTheNewerOne() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        let gate = Gate()
        api.categoriasGate = gate
        api.setCategoriasResults([.success(CatalogoCategorias(categorias: [])), .success(SampleData.catalog)])

        let first = Task { await viewModel.refresh() }
        await gate.waitUntilWaiting()
        api.categoriasGate = nil
        await viewModel.refresh()
        await gate.open()
        await first.value

        #expect(viewModel.state == .loaded(SampleData.catalog))
    }

    @Test func aLoadCancelledBeforeItFinishedRunsAgainOnTheNextAppearance() async {
        let api = FakeMirachAPI()
        api.setCategoriasResults([.failure(CancellationError()), .success(SampleData.catalog)])
        let viewModel = make(api)

        await viewModel.loadIfNeeded()
        #expect(viewModel.state == .loading)

        await viewModel.loadIfNeeded()
        #expect(viewModel.state == .loaded(SampleData.catalog))
        await viewModel.loadIfNeeded()
        #expect(api.categoriasCalls == 2, "appearing again must not reload and blank the list")
    }

    @Test func anInitialLoadSupersededByARefreshStillMarksTheListLoaded() async {
        let api = FakeMirachAPI()
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

        #expect(viewModel.state == .loaded(SampleData.catalog))
        #expect(api.categoriasCalls == 2, "appearing again must not reload and blank the list")
    }

    @Test func aFailedLoadStillCountsAsFinishedSoTheErrorIsNotRetriedOnReappearing() async {
        let api = FakeMirachAPI()
        api.setCategoriasResults([.failure(APIError.badStatus(503)), .success(SampleData.catalog)])
        let viewModel = make(api)

        await viewModel.loadIfNeeded()
        await viewModel.loadIfNeeded()

        #expect(viewModel.state == .failed(.server))
        #expect(api.categoriasCalls == 1)
    }

    // MARK: refresh

    @Test func aFailedRefreshKeepsTheListAndSaysSoUntilTheNextSuccess() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        api.setCategoriasResults([.failure(URLError(.timedOut))])

        await viewModel.refresh()

        #expect(viewModel.state == .loaded(SampleData.catalog))
        #expect(viewModel.refreshNotice == "No se pudo actualizar la lista.")

        api.setCategoriasResults([.success(SampleData.catalog)])
        await viewModel.refresh()
        #expect(viewModel.refreshNotice == nil)
    }

    @Test func aChangeMadeElsewhereRereadsTheCatalogAndAFailureSaysTheChangeDidApply() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        api.setCategoriasResults([.failure(URLError(.timedOut))])

        await viewModel.catalogDidChange()

        #expect(viewModel.state == .loaded(SampleData.catalog), "the list stays")
        #expect(viewModel.refreshNotice == "El cambio se aplicó, pero no pudimos actualizar la lista. Desliza hacia abajo para actualizar.")
        #expect(api.categoriasCalls == 2)
    }

    // MARK: creating

    @Test func creatingSendsTheFormAsIsAndTheCategoryJoinsItsGroup() async throws {
        let api = FakeMirachAPI()
        api.setCrearCategoriaResults([.success(created)])
        let changes = Changes()
        let viewModel = make(api, changes: changes)
        await viewModel.load()
        let form = NuevaCategoria(nombre: "Mascotas", bucket: .deseos, patron: nil, icono: "paw-print")

        await viewModel.create(form)

        #expect(api.crearCategoriaCalls == [form])
        let deseos = try #require(loadedCatalog(viewModel)?.groups.first { $0.bucket == .deseos })
        #expect(deseos.categorias.map(\.nombre) == ["Desconocido", "Mascotas", "Restaurantes"], "kept sorted by name")
        #expect(viewModel.announcement == "Categoría «Mascotas» creada")
        #expect(viewModel.createdCount == 1)
        #expect(viewModel.formErrors.isEmpty)
        #expect(changes.count == 1, "the other screens are told once")
    }

    @Test func whileCreatingTheFormShowsProgressAndASecondSubmitIsIgnored() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        let gate = Gate()
        api.crearGate = gate
        let form = NuevaCategoria(nombre: "Mascotas", bucket: .deseos, patron: nil)

        let first = Task { await viewModel.create(form) }
        await gate.waitUntilWaiting()
        #expect(viewModel.isCreating)
        await viewModel.create(form)
        await gate.open()
        await first.value

        #expect(api.crearCategoriaCalls.count == 1)
        #expect(!viewModel.isCreating)
    }

    @Test(arguments: [
        (CategoriaError.invalidName, "name", "El nombre debe tener entre 1 y 40 caracteres"),
        (CategoriaError.duplicateName, "name", "Ya tienes una categoría con ese nombre"),
        (CategoriaError.bucketNotAssignable, "bucket", "Elige un grupo: Necesidades, Deseos o Ahorro"),
        (CategoriaError.invalidIcon, "general", "Elige un ícono válido de la lista"),
        (CategoriaError.rejected(message: "Otra cosa"), "general", "Otra cosa"),
    ] as [(CategoriaError, String, String)])
    func eachRejectionLandsOnItsFieldAndTheFormStaysOpen(error: CategoriaError, field: String, text: String) async {
        let api = FakeMirachAPI()
        api.setCrearCategoriaResults([.failure(error)])
        let changes = Changes()
        let viewModel = make(api, changes: changes)
        await viewModel.load()

        await viewModel.create(NuevaCategoria(nombre: "X", bucket: .deseos, patron: nil))

        let shown: String? = switch field {
        case "name": viewModel.formErrors.name
        case "bucket": viewModel.formErrors.bucket
        default: viewModel.formErrors.general
        }
        #expect(shown == text)
        #expect(viewModel.createdCount == 0, "the form must not close")
        #expect(viewModel.announcement == nil)
        #expect(changes.count == 0)
        #expect(loadedCatalog(viewModel) == SampleData.catalog)
    }

    @Test func aConnectionFailureWhileCreatingKeepsTheFormWithAGeneralMessage() async {
        let api = FakeMirachAPI()
        api.setCrearCategoriaResults([.failure(URLError(.notConnectedToInternet))])
        let viewModel = make(api)
        await viewModel.load()

        await viewModel.create(NuevaCategoria(nombre: "X", bucket: .deseos, patron: nil))

        #expect(viewModel.formErrors.general == "No pudimos crear la categoría. Revisa tu conexión e inténtalo de nuevo.")
        #expect(!viewModel.isCreating)
    }

    @Test func anExpiredSessionWhileCreatingShowsNoFormError() async {
        let api = FakeMirachAPI()
        api.setCrearCategoriaResults([.failure(APIError.sessionExpired)])
        let viewModel = make(api)
        await viewModel.load()

        await viewModel.create(NuevaCategoria(nombre: "X", bucket: .deseos, patron: nil))

        #expect(viewModel.formErrors.isEmpty)
    }

    @Test func openingTheFormAgainClearsTheErrorsOfTheLastAttempt() async {
        let api = FakeMirachAPI()
        api.setCrearCategoriaResults([.failure(CategoriaError.duplicateName)])
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.create(NuevaCategoria(nombre: "X", bucket: .deseos, patron: nil))
        #expect(!viewModel.formErrors.isEmpty)

        viewModel.resetForm()

        #expect(viewModel.formErrors.isEmpty)
    }

    @Test func aRefreshThatStartedBeforeTheCreationCannotTakeTheNewCategoryAway() async throws {
        let api = FakeMirachAPI()
        api.setCrearCategoriaResults([.success(created)])
        let viewModel = make(api)
        await viewModel.load()
        let gate = Gate()
        api.categoriasGate = gate
        let stale = Task { await viewModel.refresh() }
        await gate.waitUntilWaiting()
        api.categoriasGate = nil

        await viewModel.create(NuevaCategoria(nombre: "Mascotas", bucket: .deseos, patron: nil))
        await gate.open()
        await stale.value

        let all = try #require(loadedCatalog(viewModel)).categorias
        #expect(all.contains { $0.id == "cat-new" })
    }

    @Test func creatingIsIgnoredWhileTheCatalogIsNotLoaded() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)

        await viewModel.create(NuevaCategoria(nombre: "X", bucket: .deseos, patron: nil))

        #expect(api.crearCategoriaCalls.isEmpty)
    }

    @Test func aPullToRefreshDropsTheAnnouncementSoItIsNotStale() async {
        let api = FakeMirachAPI()
        api.setCrearCategoriaResults([.success(created)])
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.create(NuevaCategoria(nombre: "Mascotas", bucket: .deseos, patron: nil))
        #expect(viewModel.announcement != nil)

        await viewModel.refresh()

        #expect(viewModel.announcement == nil)
    }

    @Test func theRereadAfterTheWriteItselfKeepsTheAnnouncement() async {
        let api = FakeMirachAPI()
        api.setCrearCategoriaResults([.success(created)])
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.create(NuevaCategoria(nombre: "Mascotas", bucket: .deseos, patron: nil))

        await viewModel.catalogDidChange()

        #expect(viewModel.announcement == "Categoría «Mascotas» creada")
    }

    @Test func dismissingTheAnnouncementClearsIt() async {
        let api = FakeMirachAPI()
        api.setCrearCategoriaResults([.success(created)])
        let viewModel = make(api)
        await viewModel.load()
        await viewModel.create(NuevaCategoria(nombre: "Mascotas", bucket: .deseos, patron: nil))

        viewModel.dismissAnnouncement()

        #expect(viewModel.announcement == nil)
    }

    @Test func aDeletionFromTheDetailIsAnnouncedByTheList() async {
        let viewModel = make()
        await viewModel.load()

        viewModel.announceDeletion(of: "Mascotas")

        #expect(viewModel.announcement == "Categoría «Mascotas» eliminada")
    }
}
