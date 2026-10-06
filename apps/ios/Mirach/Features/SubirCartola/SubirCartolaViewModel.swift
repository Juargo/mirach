import Foundation
import Observation

/// State machine of "Subir cartola" (`docs/catalogo/pantallas/subir-cartola.md`).
///
/// The password and the staged file live in private properties, never in `state`, so they
/// cannot leak through a screen, a log line or a test failure message.
@MainActor
@Observable
final class SubirCartolaViewModel {
    enum State: Equatable {
        /// Nothing chosen. `message` explains a refused file or a rejected upload.
        case inicial(message: String?)
        case previsualizando
        /// A protected PDF: ask for the password (`incorrect` after a wrong attempt).
        case protegido(filename: String, incorrect: Bool)
        case errorPrevia(PreviewFailure)
        case decidiendo(CartolaPreview)
        /// Reviewing the rows. The edits live in `edits`, not here.
        case revisando(CartolaPreview)
        case subiendo
        case errorImportacion(ImportFailure)
        case exito(ImportSummary)
    }

    enum PreviewFailure: Equatable {
        case noMovements
        /// The server's own message for a bad file, unknown bank or bad structure.
        case rejected(message: String)
        case temporarilyUnavailable
        case accountProblem
        case connection
        case server
    }

    enum ImportFailure: Equatable {
        case temporarilyUnavailable
        /// Permanent: retrying cannot help.
        case accountProblem
        case connection
        case server

        var isRetryable: Bool { self != .accountProblem }
    }

    struct ImportSummary: Equatable {
        let banco: String
        let totalTransacciones: Int
        let duplicadosOmitidos: Int
    }

    /// The user's categories, loaded on reaching `decidiendo`. The review needs them; "Subir
    /// tal cual" does not, so a failure here never blocks it.
    enum CatalogState: Equatable {
        case loading
        case loaded(CatalogoCategorias)
        case failed
    }

    private(set) var state: State = .inicial(message: nil)
    /// Grows by one with every finished import: lets the signed-in shell reload the Resumen.
    private(set) var importsCompleted = 0

    private(set) var catalog: CatalogState = .loading
    /// What the person changed, `rowIndex` to `categoriaId`. Only touched rows are in here.
    private(set) var edits: [Int: String] = [:]
    /// A message above the review (a refused edit, a commit that bounced back), or `nil`.
    private(set) var reviewNotice: String?

    // MARK: create a category from a row

    /// Field-level messages of the "Crear categoría" form.
    struct CategoryFormErrors: Equatable {
        var name: String?
        var bucket: String?
        var pattern: String?
        /// A problem that belongs to no field (unknown code, connection).
        var general: String?
        var isEmpty: Bool { self == CategoryFormErrors() }
    }

    /// The repeated preview after creating a category.
    enum PreviewRefresh: Equatable {
        case idle
        case updating
        /// The category exists but the new preview could not load; "Reintentar" is offered.
        case failed(categoryName: String)
    }

    private(set) var isCreatingCategory = false
    private(set) var categoryFormErrors = CategoryFormErrors()
    /// Grows by one with every category created: the form closes when it changes.
    private(set) var createdCategoryCount = 0
    private(set) var previewRefresh: PreviewRefresh = .idle
    /// A neutral message above the review («X» applied to N more rows).
    private(set) var reviewInfo: String?

    /// Called when the form opens: clears the errors of a previous attempt.
    func resetCategoryForm() {
        categoryFormErrors = CategoryFormErrors()
    }

    /// "Crear" in the category form, for the row whose sheet it was opened from. On success the
    /// row takes the new category (an edit), the form closes (`createdCategoryCount` changes)
    /// and the preview is repeated with the same file and password so the new pattern can
    /// reclassify other rows. Manual edits are never touched by the repeat.
    func createCategory(_ new: NuevaCategoria, forRow rowIndex: Int) async {
        guard case .revisando(let current) = state, case .loaded(let categories) = catalog,
              previewRefresh != .updating, !isCreatingCategory,
              let row = current.filas.first(where: { $0.rowIndex == rowIndex }), !row.esDuplicado
        else { return }
        isCreatingCategory = true
        categoryFormErrors = CategoryFormErrors()
        let mine = generation
        let category: CategoriaCatalogo
        do {
            category = try await api.crearCategoria(new)
        } catch {
            guard mine == generation else { return }
            isCreatingCategory = false
            if case APIError.sessionExpired = error {
                discard()
            } else {
                categoryFormErrors = Self.formErrors(for: error)
            }
            return
        }
        guard mine == generation else { return }
        isCreatingCategory = false
        // The category exists on the server now: usable at once, even if the refresh below fails.
        catalog = .loaded(CatalogoCategorias(categorias: categories.categorias + [category]))
        var next = edits
        next[rowIndex] = category.id
        if CartolaEdit.json(Self.sorted(next)).utf8.count <= CartolaEdit.maxJSONBytes {
            edits = next
            reviewNotice = nil
        } else {
            reviewNotice = Self.tooManyEditsMessage
        }
        reviewInfo = nil
        createdCategoryCount += 1
        await refreshPreview(category: category, fromRow: rowIndex, generation: mine)
    }

    /// "Reintentar" after the repeated preview failed.
    func retryPreviewRefresh() async {
        guard case .failed = previewRefresh, let pendingRefresh, case .revisando = state else { return }
        await refreshPreview(category: pendingRefresh.category, fromRow: pendingRefresh.row, generation: generation)
    }

    private func refreshPreview(category: CategoriaCatalogo, fromRow: Int, generation mine: Int) async {
        guard let file else { return }
        let (name, id) = (category.nombre, category.id)
        pendingRefresh = (category, fromRow)
        previewRefresh = .updating
        // The names of the categories first, so rows resolve against the server's catalog; if it
        // cannot be read the local one (with the new category) stays.
        if let fresh = try? await api.categorias(), mine == generation {
            // A catalog read a moment after the creation should list it; if it does not (a stale
            // read), the category the server just confirmed is still offered.
            let listed = fresh.categoria(id: id) != nil
            catalog = .loaded(listed ? fresh : CatalogoCategorias(categorias: fresh.categorias + [category]))
        }
        guard mine == generation else { return }
        do {
            let result = try await api.previewIngesta(file: file, password: password)
            guard mine == generation, case .revisando(let before) = state else { return }
            let count = Self.newMatches(
                before: before.filas, after: result.filas, categoryID: id, fromRow: fromRow, edits: edits
            )
            preview = result
            state = .revisando(result)
            // Same file, same rows: an edit names a row that still exists (anything else drops).
            let editable = Set(result.filas.filter { !$0.esDuplicado }.map(\.rowIndex))
            edits = edits.filter { editable.contains($0.key) }
            pendingRefresh = nil
            previewRefresh = .idle
            reviewInfo = Self.appliedMessage(name: name, count: count)
        } catch {
            guard mine == generation else { return }
            if case APIError.sessionExpired = error {
                discard()
            } else {
                previewRefresh = .failed(categoryName: name)
            }
        }
    }

    /// The catalog once it is loaded, `nil` while loading or after a failure.
    var loadedCatalog: CatalogoCategorias? {
        if case .loaded(let catalog) = catalog { catalog } else { nil }
    }

    /// The staged file, for the "Archivo elegido" line. `nil` when nothing is staged.
    var stagedFile: CartolaFile? { file }

    private let api: any MirachAPI
    private let staging: any CartolaStaging
    private var file: CartolaFile?
    private var password: String?
    private var preview: CartolaPreview?
    /// The last commit attempt, to retry it as it was.
    /// Set when a commit bounced because of the edits: the next catalog that loads drops the
    /// edits whose category it no longer has.
    private var pendingRefresh: (category: CategoriaCatalogo, row: Int)?
    private var pruneEditsPending = false
    /// A commit already bounced back to the review because of the edits: a second rejection
    /// is not about the edits.
    private var editsBounced = false
    private var lastCommit: (edits: [CartolaEdit], fromReview: Bool)?
    /// Bumped whenever the flow is reset so an answer to an old request is dropped.
    private var generation = 0

    init(api: any MirachAPI, staging: any CartolaStaging) {
        self.api = api
        self.staging = staging
        // No purge here: SwiftUI may build a throwaway view model while a live flow holds a
        // staged copy. Leftovers of a killed run are purged once at launch (`AppEnvironment`).
    }

    // MARK: actions

    /// Picked from the document picker (or from the UI-test hook). Validates and stages the
    /// file, then asks for the preview. Allowed where the person can choose another file.
    func chooseFile(_ source: URL) async {
        switch state {
        case .inicial, .protegido, .errorPrevia: break
        default: return
        }
        clear()
        let mine = generation
        do {
            file = try staging.stage(source)
        } catch let problem as CartolaFileProblem {
            state = .inicial(message: Self.message(for: problem))
            return
        } catch {
            state = .inicial(message: Self.message(for: .unreadable))
            return
        }
        await runPreview(generation: mine)
    }

    /// "Reintentar" with a password from the `protegido` state.
    func submitPassword(_ text: String) async {
        guard case .protegido = state, !text.isEmpty else { return }
        password = text
        await runPreview(generation: generation)
    }

    /// "Reintentar" after a failed preview.
    func retryPreview() async {
        guard case .errorPrevia = state, file != nil else { return }
        await runPreview(generation: generation)
    }

    /// "Reintentar" for the catalog, from the decision or the review.
    func retryCatalog() async {
        switch state {
        case .decidiendo, .revisando: break
        default: return
        }
        guard catalog == .failed else { return }
        await loadCatalog(generation: generation)
    }

    /// "Revisar y editar". Needs the catalog: without it the rows cannot be named or edited.
    func startReview() {
        guard case .decidiendo(let preview) = state, case .loaded = catalog else { return }
        edits = [:]
        reviewNotice = nil
        state = .revisando(preview)
    }

    /// The person picked `categoriaId` for a row. Kept in memory until "Confirmar".
    /// Picking the category the server already suggested undoes the edit: the row goes back to
    /// being classified by the server, and the list of touched rows stays minimal.
    func choose(_ categoriaId: String, forRow rowIndex: Int) {
        guard case .revisando(let preview) = state, case .loaded(let categories) = catalog,
              previewRefresh != .updating,
              let row = preview.filas.first(where: { $0.rowIndex == rowIndex }), !row.esDuplicado,
              categories.categoria(id: categoriaId) != nil
        else { return }
        var next = edits
        next[rowIndex] = row.sugerido?.categoriaId == categoriaId ? nil : categoriaId
        guard CartolaEdit.json(Self.sorted(next)).utf8.count <= CartolaEdit.maxJSONBytes else {
            reviewNotice = Self.tooManyEditsMessage
            return
        }
        edits = next
        reviewNotice = nil
    }

    /// "Confirmar": commits with only the rows the person touched.
    func confirm() async {
        guard case .revisando = state, case .loaded = catalog, previewRefresh != .updating else { return }
        await commit(edits: Self.sorted(edits), fromReview: true)
    }

    /// "Subir tal cual": commit with no edits.
    func uploadAsIs() async {
        guard case .decidiendo = state else { return }
        await commit(edits: [], fromReview: false)
    }

    /// "Reintentar" after a failed import: the same edits again.
    func retryImport() async {
        guard case .errorImportacion(let failure) = state, failure.isRetryable, let lastCommit else { return }
        await commit(edits: lastCommit.edits, fromReview: lastCommit.fromReview)
    }

    /// Whether the failed import came from the review, so the person can go back to it.
    var canReturnToReview: Bool {
        if case .errorImportacion = state, lastCommit?.fromReview == true { return true }
        return false
    }

    /// "Volver a revisar": the edits are still there.
    func backToReview() {
        guard canReturnToReview, let preview else { return }
        reviewNotice = nil
        state = .revisando(preview)
    }

    /// Discard, "Subir otra cartola", "Empezar de nuevo" and sign-out all end here: back to
    /// the start with the file copy and the password gone. The confirmation dialog belongs to
    /// the view.
    func discard() {
        clear()
        state = .inicial(message: nil)
    }

    // MARK: internals

    private func runPreview(generation mine: Int) async {
        guard let file else { return }
        state = .previsualizando
        do {
            let result = try await api.previewIngesta(file: file, password: password)
            guard mine == generation else { return }
            preview = result
            state = .decidiendo(result)
            // The catalog arrives after the decision shows: "Subir tal cual" never waits for it.
            await loadCatalog(generation: mine)
        } catch {
            guard mine == generation else { return }
            failPreview(error, filename: file.filename)
        }
    }

    private func commit(edits: [CartolaEdit], fromReview: Bool) async {
        guard let file, let preview else { return }
        lastCommit = (edits, fromReview)
        state = .subiendo
        let mine = generation
        do {
            let result = try await api.commitIngesta(file: file, password: password, edits: edits)
            guard mine == generation else { return }
            // Done: the copy and the password are not needed any more.
            let summary = ImportSummary(
                banco: preview.banco,
                totalTransacciones: result.totalTransacciones,
                duplicadosOmitidos: result.duplicadosOmitidos
            )
            clear()
            importsCompleted += 1
            state = .exito(summary)
        } catch {
            guard mine == generation else { return }
            await failImport(error, sentEdits: !edits.isEmpty)
        }
    }

    /// Loads the catalog. Returns how many edits the pending prune dropped, or `nil` when the
    /// load failed or the flow moved on.
    @discardableResult
    private func loadCatalog(generation mine: Int) async -> Int? {
        catalog = .loading
        do {
            let result = try await api.categorias()
            guard mine == generation else { return nil }
            catalog = .loaded(result)
            // An edit naming a category that no longer exists would be refused again. The prune
            // waits for a catalog that loads, whichever call (reload or "Reintentar") gets it.
            guard pruneEditsPending else { return 0 }
            let kept = edits.filter { result.categoria(id: $0.value) != nil }
            let removed = edits.count - kept.count
            edits = kept
            pruneEditsPending = false
            return removed
        } catch {
            guard mine == generation else { return nil }
            if case APIError.sessionExpired = error {
                discard()
            } else {
                catalog = .failed
            }
            return nil
        }
    }

    private static func sorted(_ edits: [Int: String]) -> [CartolaEdit] {
        edits.sorted { $0.key < $1.key }.map { CartolaEdit(rowIndex: $0.key, categoriaId: $0.value) }
    }

    private func failPreview(_ error: any Error, filename: String) {
        switch error {
        case APIError.sessionExpired:
            // The root view is already moving to sign-in; leave nothing behind.
            discard()
        case IngestaError.passwordRequired:
            password = nil
            state = .protegido(filename: filename, incorrect: false)
        case IngestaError.passwordIncorrect:
            password = nil
            state = .protegido(filename: filename, incorrect: true)
        case IngestaError.fileUnreadable:
            // Not retryable: drop the broken copy and the password, ask for the file again.
            discard()
            state = .inicial(message: Self.unreadableCopyMessage)
        case IngestaError.noMovements: state = .errorPrevia(.noMovements)
        case IngestaError.rejected(let message): state = .errorPrevia(.rejected(message: message))
        case IngestaError.catalogUnavailable: state = .errorPrevia(.temporarilyUnavailable)
        case IngestaError.catalogIncomplete: state = .errorPrevia(.accountProblem)
        case is URLError, is CancellationError: state = .errorPrevia(.connection)
        default: state = .errorPrevia(.server)
        }
    }

    private func failImport(_ error: any Error, sentEdits: Bool) async {
        switch error {
        case APIError.sessionExpired:
            discard()
        case IngestaError.rejected(let message) where sentEdits && !editsBounced:
            // The contract gives a 400 about `edits` the same shape as one about the file. This
            // file just previewed fine, so the edits are the likely cause (the catalog drifted):
            // reload the catalog and drop the edits it explains. If that explains nothing, the
            // 400 is about the file after all.
            guard let preview else { return }
            let mine = generation
            pruneEditsPending = true
            let removed = await loadCatalog(generation: mine)
            guard mine == generation else { return }
            if removed == 0 {
                rejectCommit(message)
                return
            }
            editsBounced = true
            reviewNotice = Self.badEditsMessage
            state = .revisando(preview)
        case IngestaError.rejected(let message):
            rejectCommit(message)
        case IngestaError.noMovements:
            clear()
            state = .inicial(message: Self.noMovementsMessage)
        case IngestaError.fileUnreadable:
            clear()
            state = .inicial(message: Self.unreadableCopyMessage)
        case IngestaError.catalogIncomplete: state = .errorImportacion(.accountProblem)
        case IngestaError.catalogUnavailable: state = .errorImportacion(.temporarilyUnavailable)
        // A cancelled request (the app went to the background) is safe to retry: a failed
        // commit saves nothing.
        case is URLError, is CancellationError: state = .errorImportacion(.connection)
        default: state = .errorImportacion(.server)
        }
    }

    /// Same family as the preview's 400 (file, bank, structure): the server's message, back to
    /// the start.
    private func rejectCommit(_ message: String) {
        clear()
        state = .inicial(message: message)
    }

    /// Forgets the file, its copy on disk, the password and any pending answer.
    private func clear() {
        generation += 1
        if let file { staging.discard(file) }
        file = nil
        password = nil
        preview = nil
        lastCommit = nil
        pruneEditsPending = false
        editsBounced = false
        pendingRefresh = nil
        previewRefresh = .idle
        reviewInfo = nil
        isCreatingCategory = false
        categoryFormErrors = CategoryFormErrors()
        catalog = .loading
        edits = [:]
        reviewNotice = nil
    }
}
