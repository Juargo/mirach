import Foundation
import Observation

/// State of "Detalle de bucket": one bucket and month at a time, plus the reclassification of
/// a movement (a sheet over the list) and the creation of a category from that sheet.
@MainActor
@Observable
final class DetalleBucketViewModel {
    enum Failure: Equatable {
        /// No answer from the server (offline, timeout).
        case connection
        /// The server answered with something the app cannot use (5xx, unexpected body).
        case server
    }

    enum State: Equatable {
        case loading
        case loaded(BucketDetalle)
        case failed(Failure)
    }

    /// The user's categories, loaded the first time the sheet opens.
    enum CatalogState: Equatable {
        case idle
        case loading
        case loaded(CatalogoCategorias)
        case failed
    }

    /// A move to another bucket, waiting for the person to confirm it (it changes the month's maths).
    struct BucketChange: Equatable {
        let movement: MovimientoBucket
        let category: CategoriaCatalogo
    }

    let bucket: Bucket
    private(set) var state: State = .loading
    /// The month on screen (or being loaded).
    private(set) var periodo: Periodo
    /// Months with movements, most recent first. Empty until loaded or if that call failed:
    /// the detail does not depend on it.
    private(set) var periodos: [Periodo] = []

    private(set) var catalog: CatalogState = .idle
    /// The movement the sheet is open for, or `nil` when it is closed.
    private(set) var sheetMovement: MovimientoBucket?
    private(set) var pendingChange: BucketChange?
    /// The movement being sent to the server: it shows progress and nothing else can be done.
    private(set) var reclassifyingId: String?
    /// A message inside the sheet (the move failed but the sheet stays open to try again).
    private(set) var sheetNotice: String?
    /// A message on the screen (the list is out of date, the movement is gone).
    private(set) var notice: String?
    /// What VoiceOver announces after a successful move: «Movida a Deseos · Ropa».
    private(set) var announcement: String?

    private(set) var isCreatingCategory = false
    private(set) var categoryFormErrors = SubirCartolaViewModel.CategoryFormErrors()
    /// Grows by one with every category created: the form closes when it changes.
    private(set) var createdCategoryCount = 0

    private let api: any MirachAPI
    /// Told once per successful move: the Resumen's figures changed too.
    private let onReclassified: @MainActor () -> Void
    /// Bumped on every detail request so a late answer for an older choice is dropped.
    private var generation = 0
    private var needsLoad = true

    init(api: any MirachAPI, bucket: Bucket, periodo: Periodo, onReclassified: @escaping @MainActor () -> Void = {}) {
        self.api = api
        self.bucket = bucket
        self.periodo = periodo
        self.onReclassified = onReclassified
    }

    /// The next older month that has data (the list is most recent first), if any.
    var anterior: Periodo? { neighbour(offset: 1) }
    /// The next newer month that has data, if any.
    var siguiente: Periodo? { neighbour(offset: -1) }

    // MARK: detail

    /// Runs `load()` unless the screen already finished one: its task restarts on every
    /// appearance, and one cancelled midway (the screen went away) must run again.
    func loadIfNeeded() async {
        guard needsLoad else { return }
        await load()
    }

    func load() async {
        state = .loading
        async let months = fetchPeriodos()
        // Answered (even with a failure the screen shows): done. Cancelled: still to do.
        if await fetch(periodo: periodo) != nil { needsLoad = false }
        if let months = await months { periodos = months }
    }

    /// "Reintentar": the same query that failed, again.
    func retry() async {
        state = .loading
        await fetch(periodo: periodo)
        if periodos.isEmpty, let months = await fetchPeriodos() { periodos = months }
    }

    /// Pull to refresh: repeats the query without blanking the list, and keeps it if it fails.
    func refresh() async {
        guard case .loaded = state else { return await retry() }
        await fetch(periodo: periodo, keepingContentOnFailure: true)
    }

    func select(_ periodo: Periodo) async {
        state = .loading
        await fetch(periodo: periodo)
    }

    private func neighbour(offset: Int) -> Periodo? {
        guard let index = periodos.firstIndex(of: periodo) else { return nil }
        let target = index + offset
        return periodos.indices.contains(target) ? periodos[target] : nil
    }

    /// `true`: the detail on screen is now fresh. `false`: the request failed. `nil`: a newer
    /// request took over (or the call was cancelled), so there is nothing to report.
    @discardableResult
    private func fetch(periodo: Periodo, keepingContentOnFailure: Bool = false) async -> Bool? {
        self.periodo = periodo
        generation += 1
        let mine = generation
        do {
            let detalle = try await api.bucketDetalle(bucket: bucket, periodo: periodo)
            guard mine == generation else { return nil }
            state = .loaded(detalle)
            return true
        } catch {
            guard mine == generation, Self.failure(for: error) != nil else { return nil }
            if !keepingContentOnFailure, let failure = Self.failure(for: error) { state = .failed(failure) }
            return false
        }
    }

    private func fetchPeriodos() async -> [Periodo]? {
        try? await api.periodos()
    }

    /// `nil` means "show nothing": the request was cancelled (the screen went away) or the
    /// session expired, in which case the root view is already switching to sign-in.
    private static func failure(for error: any Error) -> Failure? {
        switch error {
        case is CancellationError: nil
        case APIError.sessionExpired: nil
        case let error as URLError where error.code == .cancelled: nil
        case is URLError: .connection
        default: .server
        }
    }

    // MARK: reclassification

    /// Opens the sheet for a movement; the catalog loads the first time only.
    func beginReclassify(_ movement: MovimientoBucket) async {
        guard reclassifyingId == nil else { return }
        sheetMovement = movement
        sheetNotice = nil
        announcement = nil
        notice = nil
        if catalog == .idle { await loadCatalog() }
    }

    func dismissSheet() {
        guard reclassifyingId == nil else { return }
        sheetMovement = nil
        pendingChange = nil
        sheetNotice = nil
    }

    /// "Reintentar" inside the sheet after the catalog failed.
    func retryCatalog() async {
        guard catalog == .failed else { return }
        await loadCatalog()
    }

    private func loadCatalog() async {
        catalog = .loading
        do {
            catalog = .loaded(try await api.categorias())
        } catch {
            // A rejected session is already being handled; either way the sheet offers a retry.
            catalog = .failed
        }
    }

    /// The person picked a category in the sheet. Another bucket asks for confirmation first.
    func choose(categoryId: String) async {
        guard reclassifyingId == nil, pendingChange == nil, let movement = sheetMovement,
              case .loaded(let categories) = catalog, let category = categories.categoria(id: categoryId)
        else { return }
        guard category.id != currentCategoryId(of: movement) else { return dismissSheet() }
        if category.bucket != bucket {
            pendingChange = BucketChange(movement: movement, category: category)
        } else {
            await move(movement, to: category)
        }
    }

    func confirmBucketChange() async {
        guard reclassifyingId == nil, let change = pendingChange else { return }
        pendingChange = nil
        await move(change.movement, to: change.category)
    }

    /// «Cancelar»: the choice is reverted and the sheet stays open.
    func cancelBucketChange() {
        pendingChange = nil
    }

    func currentCategoryId(of movement: MovimientoBucket) -> String? {
        guard case .loaded(let detalle) = state else { return nil }
        return detalle.grupos.first { $0.transacciones.contains { $0.id == movement.id } }?.categoriaId
    }

    private func move(_ movement: MovimientoBucket, to category: CategoriaCatalogo) async {
        reclassifyingId = movement.id
        sheetNotice = nil
        let result: Reclasificacion
        do {
            result = try await api.reclasificar(transaccionId: movement.id, categoriaId: category.id)
        } catch {
            reclassifyingId = nil
            await handleMoveFailure(error)
            return
        }
        reclassifyingId = nil
        sheetMovement = nil
        announcement = "Movida a \(result.bucket.label) · \(result.categoriaNombre)"
        onReclassified()
        // The movement may have changed group or left this bucket: ask again.
        if await fetch(periodo: periodo, keepingContentOnFailure: true) == false {
            notice = "Se movió, pero no pudimos actualizar la lista. Desliza hacia abajo para actualizar."
        }
    }

    private func handleMoveFailure(_ error: any Error) async {
        switch error {
        case ReclasificarError.categoryNotFound:
            sheetNotice = "Esa categoría ya no existe. Elige otra."
            await loadCatalog()
        case ReclasificarError.movementNotFound:
            sheetMovement = nil
            notice = "Ese movimiento ya no existe."
            await fetch(periodo: periodo, keepingContentOnFailure: true)
        case APIError.sessionExpired, is CancellationError:
            break
        case is URLError:
            sheetNotice = "No pudimos mover el movimiento. Revisa tu conexión e inténtalo de nuevo."
        default:
            sheetNotice = "No pudimos mover el movimiento. Inténtalo de nuevo."
        }
    }

    // MARK: create a category from the sheet

    func resetCategoryForm() {
        categoryFormErrors = SubirCartolaViewModel.CategoryFormErrors()
    }

    /// "Crear" in the form: on success the category joins the catalog, the form closes and the
    /// movement continues down the normal path (confirmation included when the bucket differs).
    func createCategory(_ new: NuevaCategoria) async {
        guard let movement = sheetMovement, case .loaded(let categories) = catalog,
              !isCreatingCategory, reclassifyingId == nil
        else { return }
        isCreatingCategory = true
        categoryFormErrors = SubirCartolaViewModel.CategoryFormErrors()
        let category: CategoriaCatalogo
        do {
            category = try await api.crearCategoria(new)
        } catch {
            isCreatingCategory = false
            if case APIError.sessionExpired = error { return }
            categoryFormErrors = SubirCartolaViewModel.formErrors(for: error)
            return
        }
        isCreatingCategory = false
        // The server confirmed it: usable at once.
        catalog = .loaded(CatalogoCategorias(categorias: categories.categorias + [category]))
        createdCategoryCount += 1
        guard sheetMovement == movement else { return }
        await choose(categoryId: category.id)
    }
}
