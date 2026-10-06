import Foundation
import Testing
@testable import Mirach

/// "Crear categoría desde una fila": the form's call, the edit it applies, and the repeated preview.
@MainActor
struct SubirCartolaCategoriaTests {
    private let xlsx = URL(fileURLWithPath: "/picked/cartola.xlsx")
    private let pdf = URL(fileURLWithPath: "/picked/cartola.pdf")
    private let created = CategoriaCatalogo(id: "cat-new", nombre: "Amigos", bucket: .deseos)
    private let new = NuevaCategoria(nombre: "Amigos", bucket: .deseos, patron: "TRANSF")

    /// `SampleData.preview` with `ids` of rows now suggested as the new category.
    private func preview(movingToNew ids: [Int]) -> CartolaPreview {
        let rows = SampleData.rows.map { row in
            ids.contains(row.rowIndex)
                ? CartolaRow(
                    rowIndex: row.rowIndex, fecha: row.fecha, descripcion: row.descripcion, cargo: row.cargo,
                    abono: row.abono, esDuplicado: row.esDuplicado, sugerido: .init(bucket: .deseos, categoriaId: "cat-new")
                )
                : row
        }
        return CartolaPreview(
            banco: "Banco de Chile", tipoCuenta: "Cuenta Corriente", numeroCuenta: "00-123-45678-09",
            totalFilas: 5, duplicados: 1, nuevas: 4, filas: rows
        )
    }

    private var catalogWithNew: CatalogoCategorias {
        CatalogoCategorias(categorias: SampleData.catalog.categorias + [created])
    }

    private func reviewing(_ api: FakeMirachAPI = FakeMirachAPI()) async -> (SubirCartolaViewModel, FakeMirachAPI, FakeCartolaStaging) {
        let staging = FakeCartolaStaging()
        let viewModel = SubirCartolaViewModel(api: api, staging: staging)
        await viewModel.chooseFile(xlsx)
        viewModel.startReview()
        return (viewModel, api, staging)
    }

    // MARK: success

    @Test func creatingFromARowAppliesItAsAnEditAndRepeatsThePreviewWithTheSameFileAndPassword() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([.failure(IngestaError.passwordRequired), .success(SampleData.preview), .success(preview(movingToNew: [1, 2, 3]))])
        api.setCrearCategoriaResults([.success(created)])
        api.setCategoriasResults([.success(SampleData.catalog), .success(catalogWithNew)])
        let staging = FakeCartolaStaging()
        let viewModel = SubirCartolaViewModel(api: api, staging: staging)
        await viewModel.chooseFile(pdf)
        await viewModel.submitPassword("buena")
        viewModel.startReview()
        viewModel.choose(SampleData.Cat.fondo, forRow: 0)

        await viewModel.createCategory(new, forRow: 2)

        #expect(api.crearCategoriaCalls == [new])
        #expect(api.previewCalls.count == 3)
        #expect(api.previewCalls.last?.password == "buena")
        #expect(api.previewCalls.last?.file == api.previewCalls.first?.file)
        // The row got the category, and the edit made before survives.
        #expect(viewModel.edits == [0: SampleData.Cat.fondo, 2: "cat-new"])
        #expect(viewModel.state == .revisando(preview(movingToNew: [1, 2, 3])))
        #expect(viewModel.catalog == .loaded(catalogWithNew))
        #expect(viewModel.previewRefresh == .idle)
        #expect(viewModel.createdCategoryCount == 1)
        #expect(!viewModel.isCreatingCategory)
        #expect(viewModel.categoryFormErrors.isEmpty)
        // Rows 1 and 3 changed; row 2 is the origin.
        #expect(viewModel.reviewInfo == "«Amigos» se aplicó a 2 filas más")
        #expect(staging.discarded.isEmpty)
    }

    @Test func manualEditsMadeBeforeAreNotCountedAndStayEdited() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([.success(SampleData.preview), .success(preview(movingToNew: [1, 2, 3]))])
        api.setCrearCategoriaResults([.success(created)])
        let (viewModel, _, _) = await reviewing(api)
        viewModel.choose(SampleData.Cat.transporte, forRow: 3)

        await viewModel.createCategory(new, forRow: 2)

        #expect(viewModel.edits[3] == SampleData.Cat.transporte)
        #expect(viewModel.reviewInfo == "«Amigos» se aplicó a 1 fila más")
    }

    @Test func aCategoryThatMatchesNoOtherRowSaysSoPlainly() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([.success(SampleData.preview), .success(preview(movingToNew: [2]))])
        api.setCrearCategoriaResults([.success(created)])
        let (viewModel, _, _) = await reviewing(api)

        await viewModel.createCategory(new, forRow: 2)

        #expect(viewModel.reviewInfo == "Categoría «Amigos» creada.")
        #expect(viewModel.edits == [2: "cat-new"])
    }

    @Test func theCountIgnoresTheOriginDuplicatesManualEditsAndRowsThatChangedElsewhere() {
        let before = SampleData.rows
        let after = preview(movingToNew: [1, 2, 3, 4]).filas
        let n = SubirCartolaViewModel.newMatches(
            before: before, after: after, categoryID: "cat-new", fromRow: 2, edits: [3: "x"]
        )
        // 1 counts; 2 is the origin; 3 was edited by hand; 4 is a duplicate.
        #expect(n == 1)
        // A row that now points to another category is not the new category's doing.
        let other = after.map { row in
            row.rowIndex == 1
                ? CartolaRow(
                    rowIndex: 1, fecha: row.fecha, descripcion: row.descripcion, cargo: row.cargo, abono: row.abono,
                    esDuplicado: false, sugerido: .init(bucket: .ahorro, categoriaId: SampleData.Cat.fondo)
                )
                : row
        }
        #expect(SubirCartolaViewModel.newMatches(
            before: before, after: other, categoryID: "cat-new", fromRow: 2, edits: [3: "x"]
        ) == 0)
        // Nothing changed: nothing counted. A row absent before counts if it now matches.
        #expect(SubirCartolaViewModel.newMatches(
            before: before, after: before, categoryID: "cat-new", fromRow: 2, edits: [:]
        ) == 0)
        #expect(SubirCartolaViewModel.newMatches(
            before: [], after: after, categoryID: "cat-new", fromRow: 2, edits: [:]
        ) == 2)
    }

    @Test func theMessagesHandleSingularAndPlural() {
        #expect(SubirCartolaViewModel.appliedMessage(name: "A", count: 1) == "«A» se aplicó a 1 fila más")
        #expect(SubirCartolaViewModel.appliedMessage(name: "A", count: 5) == "«A» se aplicó a 5 filas más")
        #expect(SubirCartolaViewModel.appliedMessage(name: "A", count: 0) == "Categoría «A» creada.")
        #expect(SubirCartolaViewModel.updatingPreviewMessage == "Actualizando la vista previa con la nueva categoría…")
        #expect(SubirCartolaViewModel.refreshFailedMessage(name: "A")
            == "«A» se creó, pero no pudimos actualizar la vista previa. Tus cambios siguen aquí.")
    }

    // MARK: failures

    @Test func aFailedRepeatedPreviewKeepsTheReviewTheEditsAndOffersARetry() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([
            .success(SampleData.preview), .failure(URLError(.notConnectedToInternet)),
            .success(preview(movingToNew: [1, 2])),
        ])
        api.setCrearCategoriaResults([.success(created)])
        let (viewModel, _, staging) = await reviewing(api)
        viewModel.choose(SampleData.Cat.fondo, forRow: 0)

        await viewModel.createCategory(new, forRow: 2)

        #expect(viewModel.state == .revisando(SampleData.preview), "the previous rows stay")
        #expect(viewModel.edits == [0: SampleData.Cat.fondo, 2: "cat-new"])
        #expect(viewModel.loadedCatalog?.categoria(id: "cat-new") != nil, "the new category is usable")
        #expect(viewModel.previewRefresh == .failed(categoryName: "Amigos"))
        #expect(viewModel.reviewInfo == nil)
        #expect(staging.discarded.isEmpty)

        await viewModel.retryPreviewRefresh()

        #expect(viewModel.previewRefresh == .idle)
        #expect(viewModel.state == .revisando(preview(movingToNew: [1, 2])))
        #expect(viewModel.reviewInfo == "«Amigos» se aplicó a 1 fila más")
        #expect(viewModel.edits == [0: SampleData.Cat.fondo, 2: "cat-new"])
    }

    @Test func retryingAFailedRefreshWhileAnotherCreationIsInFlightIsIgnored() async {
        let api = FakeMirachAPI()
        let second = CategoriaCatalogo(id: "cat-second", nombre: "Otra", bucket: .ahorro)
        api.setPreviewResults([
            .success(SampleData.preview), .failure(URLError(.notConnectedToInternet)),
            .success(preview(movingToNew: [1, 2])),
        ])
        api.setCrearCategoriaResults([.success(created), .success(second)])
        let (viewModel, _, _) = await reviewing(api)
        await viewModel.createCategory(new, forRow: 2)
        #expect(viewModel.previewRefresh == .failed(categoryName: "Amigos"))
        let gate = Gate()
        api.crearGate = gate

        let creating = Task { await viewModel.createCategory(NuevaCategoria(nombre: "Otra", bucket: .ahorro, patron: nil), forRow: 3) }
        await gate.waitUntilWaiting()
        #expect(viewModel.isCreatingCategory)
        await viewModel.retryPreviewRefresh()
        #expect(api.previewCalls.count == 2, "the retry must not start a preview while a creation is in flight")
        await gate.open()
        await creating.value

        // One refresh for the second category only; its count is the one shown.
        #expect(api.previewCalls.count == 3)
        #expect(viewModel.previewRefresh == .idle)
        #expect(viewModel.state == .revisando(preview(movingToNew: [1, 2])))
        #expect(viewModel.edits[3] == "cat-second")
        #expect(viewModel.reviewInfo == "Categoría «Otra» creada.")
    }

    @Test func aFailedCatalogRefreshKeepsTheCategoryTheServerJustCreated() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([.success(SampleData.preview), .success(preview(movingToNew: [2]))])
        api.setCrearCategoriaResults([.success(created)])
        api.setCategoriasResults([.success(SampleData.catalog), .failure(IngestaError.serverFailure)])
        let (viewModel, _, _) = await reviewing(api)

        await viewModel.createCategory(new, forRow: 2)

        #expect(viewModel.catalog == .loaded(catalogWithNew))
        #expect(viewModel.state == .revisando(preview(movingToNew: [2])))
    }

    @Test func aRejectedCreationShowsFormErrorsAndChangesNothing() async {
        let api = FakeMirachAPI()
        api.setCrearCategoriaResults([.failure(CategoriaError.duplicateName)])
        let (viewModel, _, _) = await reviewing(api)

        await viewModel.createCategory(new, forRow: 2)

        #expect(viewModel.categoryFormErrors.name == "Ya tienes una categoría con ese nombre")
        #expect(viewModel.edits.isEmpty)
        #expect(viewModel.createdCategoryCount == 0)
        #expect(!viewModel.isCreatingCategory)
        #expect(api.previewCalls.count == 1, "no repeated preview")
        #expect(viewModel.state == .revisando(SampleData.preview))
        viewModel.resetCategoryForm()
        #expect(viewModel.categoryFormErrors.isEmpty)
    }

    @Test(arguments: [
        (CategoriaError.invalidName, "name", "El nombre debe tener entre 1 y 40 caracteres"),
        (.bucketNotAssignable, "bucket", "Elige un grupo: Necesidades, Deseos o Ahorro"),
        (.invalidIcon, "general", "Elige un ícono válido de la lista"),
        (.invalidPattern(index: 0), "pattern", "Escribe un texto válido para el patrón (de 1 a 200 caracteres)"),
        (.invalidMatchType(index: 0), "pattern", "Ese tipo de coincidencia no es válido"),
        (.invalidRegex(index: 0), "pattern", "Esa expresión regular no es válida"),
        (.duplicateName, "name", "Ya tienes una categoría con ese nombre"),
        (.duplicatePattern(index: 0), "pattern", "Ya tienes un patrón con ese texto"),
        (.duplicatePattern(index: nil), "pattern", "Ya tienes un patrón con ese texto"),
        (.rejected(message: "Algo del servidor"), "general", "Algo del servidor"),
    ] as [(CategoriaError, String, String)])
    func eachErrorLandsInItsField(error: CategoriaError, field: String, text: String) {
        let errors = SubirCartolaViewModel.formErrors(for: error)

        let placed = [("name", errors.name), ("bucket", errors.bucket), ("pattern", errors.pattern), ("general", errors.general)]
        #expect(placed.filter { $0.1 != nil }.map(\.0) == [field])
        #expect(placed.first { $0.0 == field }?.1 == text)
    }

    @Test func anUnknownFailureIsAGeneralRetryableMessage() async {
        let api = FakeMirachAPI()
        api.setCrearCategoriaResults([.failure(URLError(.notConnectedToInternet))])
        let (viewModel, _, _) = await reviewing(api)

        await viewModel.createCategory(new, forRow: 2)

        #expect(viewModel.categoryFormErrors.general == "No pudimos crear la categoría. Revisa tu conexión e inténtalo de nuevo.")
        #expect(viewModel.edits.isEmpty)
    }

    @Test func anExpiredSessionWhileCreatingClearsTheFlow() async {
        let api = FakeMirachAPI()
        api.setCrearCategoriaResults([.failure(APIError.sessionExpired)])
        let (viewModel, _, staging) = await reviewing(api)

        await viewModel.createCategory(new, forRow: 2)

        #expect(viewModel.state == .inicial(message: nil))
        #expect(staging.discarded.count == 1)
    }

    // MARK: guards

    @Test func aDuplicateRowAnUnknownRowOrOutsideTheReviewNothingIsCreated() async {
        let (viewModel, api, _) = await reviewing()
        await viewModel.createCategory(new, forRow: 4)
        await viewModel.createCategory(new, forRow: 99)
        viewModel.discard()
        await viewModel.createCategory(new, forRow: 2)

        #expect(api.crearCategoriaCalls.isEmpty)
    }

    @Test func whileThePreviewUpdatesEditsAndConfirmAreIgnored() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([.success(SampleData.preview), .success(preview(movingToNew: [2]))])
        api.setCrearCategoriaResults([.success(created)])
        let (viewModel, _, _) = await reviewing(api)
        let gate = Gate()
        api.previewGate = gate

        let creating = Task { await viewModel.createCategory(new, forRow: 2) }
        await gate.waitUntilWaiting()
        #expect(viewModel.previewRefresh == .updating)
        viewModel.choose(SampleData.Cat.fondo, forRow: 0)
        await viewModel.confirm()
        #expect(viewModel.edits == [2: "cat-new"])
        #expect(api.commitCalls.isEmpty)
        await gate.open()
        await creating.value

        #expect(viewModel.previewRefresh == .idle)
    }

    @Test func discardingWhileThePreviewUpdatesDropsTheLateAnswer() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([.success(SampleData.preview), .success(preview(movingToNew: [2]))])
        api.setCrearCategoriaResults([.success(created)])
        let (viewModel, _, _) = await reviewing(api)
        let gate = Gate()
        api.previewGate = gate

        let creating = Task { await viewModel.createCategory(new, forRow: 2) }
        await gate.waitUntilWaiting()
        viewModel.discard()
        await gate.open()
        await creating.value

        #expect(viewModel.state == .inicial(message: nil))
        #expect(viewModel.reviewInfo == nil)
        #expect(viewModel.edits.isEmpty)
    }
}
