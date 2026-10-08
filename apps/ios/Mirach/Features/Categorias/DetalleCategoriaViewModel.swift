import Foundation
import Observation

/// State of "Detalle de categoría": one category of the catalog, its edit form (name, bucket,
/// icon), deleting it, and its patterns. The API has no endpoint for a single category, so the
/// screen reads the catalog and takes its entry by id.
@MainActor
@Observable
final class DetalleCategoriaViewModel {
    enum Failure: Equatable {
        /// No answer from the server (offline, timeout).
        case connection
        /// The server answered with something the app cannot use (5xx, unexpected body).
        case server
    }

    enum State: Equatable {
        case loading
        case loaded(CategoriaCatalogo)
        /// The id is not in the catalog (deleted elsewhere): «Esa categoría ya no existe».
        case notFound
        case failed(Failure)
    }

    /// A message next to the control that failed.
    struct FieldErrors: Equatable {
        var name: String?
        var bucket: String?
        var icon: String?
        /// A problem that belongs to no field (protected, unknown code, connection).
        var general: String?
        var isEmpty: Bool { self == FieldErrors() }
    }

    struct PatternErrors: Equatable {
        var pattern: String?
        var general: String?
        var isEmpty: Bool { self == PatternErrors() }
    }

    /// A move to another bucket waiting for the person's confirmation: it changes every month.
    struct BucketChange: Equatable {
        let count: Int
        let from: Bucket
        let to: Bucket
    }

    enum PatternSheet: Equatable {
        case adding
        case editing(PatronCategoria)
    }

    let categoriaId: String
    private(set) var state: State = .loading
    /// Set when a refresh failed and the screen is the previous answer.
    private(set) var refreshNotice: String?

    // The edit form. The screen binds to these; `changes` is what differs from the saved values.
    var draftNombre = ""
    var draftBucket: Bucket = .necesidades
    var draftIcono: String?

    private(set) var fieldErrors = FieldErrors()
    private(set) var isSaving = false
    private(set) var pendingBucketChange: BucketChange?
    private(set) var pendingDeletion = false
    private(set) var isDeleting = false
    /// The category no longer exists (deleted here or elsewhere): the screen goes back.
    private(set) var isGone = false
    /// A 403 told us it is a system category.
    private var refusedAsInternal = false
    private(set) var pendingDiscard = false

    private(set) var patternSheet: PatternSheet?
    private(set) var patternErrors = PatternErrors()
    private(set) var isSavingPattern = false
    private(set) var pendingPatternDeletion: PatronCategoria?
    private(set) var deletingPattern: String?

    /// What VoiceOver announces after a write: «Categoría guardada».
    private(set) var announcement: String?
    /// A problem on the screen that is not tied to a control.
    private(set) var notice: String?

    private let api: any MirachAPI
    /// Told once per successful write: lists, Resumen and the review catalog are stale.
    private let onChange: @MainActor () -> Void
    /// Told with the name once this screen deleted the category (the list announces it).
    private let onDeleted: @MainActor (String) -> Void
    /// Bumped on every request (and write) so a late answer for an older one is dropped.
    private var generation = 0
    private var needsLoad = true

    init(
        api: any MirachAPI, categoriaId: String,
        onChange: @escaping @MainActor () -> Void = {}, onDeleted: @escaping @MainActor (String) -> Void = { _ in }
    ) {
        self.api = api
        self.categoriaId = categoriaId
        self.onChange = onChange
        self.onDeleted = onDeleted
    }

    // MARK: derived

    var category: CategoriaCatalogo? {
        if case .loaded(let category) = state { category } else { nil }
    }

    /// A system category, from the catalog or from a 403: nothing can be edited or deleted.
    var isProtected: Bool { refusedAsInternal || category?.esInterna == true }

    var protectedMessage: String { DetalleCategoriaPresentation.protectedMessage }

    /// Only what differs from the saved category. The icon can be replaced but not cleared
    /// (the generated client cannot send `null`), so a draft without icon over a saved one is no change.
    var changes: CategoriaCambios {
        guard let category else { return CategoriaCambios() }
        var changes = CategoriaCambios()
        let name = draftNombre.trimmingCharacters(in: .whitespacesAndNewlines)
        if name != category.nombre { changes.nombre = name }
        if draftBucket != category.bucket { changes.bucket = draftBucket }
        if let icon = draftIcono, icon != category.icono { changes.icono = icon }
        return changes
    }

    var hasChanges: Bool { !changes.isEmpty }

    // MARK: loading

    /// Runs `load()` unless the screen already finished one: its task restarts on every
    /// appearance, and one cancelled midway (the screen went away) must run again.
    func loadIfNeeded() async {
        guard needsLoad else { return }
        await load()
    }

    func load() async {
        state = .loading
        refreshNotice = nil
        await fetch()
    }

    /// "Reintentar": the same query that failed, again.
    func retry() async { await load() }

    /// Pull to refresh: repeats the query without blanking the screen, and keeps it if it fails.
    func refresh() async {
        guard case .loaded = state else { return await retry() }
        await fetch(isRefresh: true)
    }

    private func fetch(isRefresh: Bool = false) async {
        generation += 1
        let mine = generation
        do {
            let catalog = try await api.categorias()
            guard mine == generation else { return }
            needsLoad = false
            refreshNotice = nil
            if let found = catalog.categoria(id: categoriaId) {
                show(found, keepingDraft: isRefresh && hasChanges)
            } else {
                state = .notFound
            }
        } catch {
            guard mine == generation, let failure = Self.failure(for: error) else { return }
            needsLoad = false
            if isRefresh {
                refreshNotice = "No se pudo actualizar la categoría."
            } else {
                state = .failed(failure)
            }
        }
    }

    /// Takes a category as the saved one; the form follows it unless the person is mid-edit.
    private func show(_ category: CategoriaCatalogo, keepingDraft: Bool = false) {
        state = .loaded(category)
        guard !keepingDraft else { return }
        draftNombre = category.nombre
        draftBucket = category.bucket
        draftIcono = category.icono
    }

    // MARK: editing the category

    /// "Guardar". A bucket change asks first (`pendingBucketChange`), also when it moves nothing.
    func save() async {
        guard let category, !isProtected, !isSaving, !isDeleting, hasChanges else { return }
        if draftBucket != category.bucket {
            pendingBucketChange = BucketChange(count: category.transaccionesCount, from: category.bucket, to: draftBucket)
            return
        }
        await performSave()
    }

    func confirmBucketChange() async {
        guard pendingBucketChange != nil else { return }
        pendingBucketChange = nil
        await performSave()
    }

    /// «Cancelar»: nothing is sent and the draft stays.
    func cancelBucketChange() { pendingBucketChange = nil }

    private func performSave() async {
        guard let category, !isProtected, !isSaving, hasChanges else { return }
        isSaving = true
        fieldErrors = FieldErrors()
        announcement = nil
        notice = nil
        let sent = changes
        let updated: CategoriaCatalogo
        do {
            updated = try await api.actualizarCategoria(id: category.id, cambios: sent)
        } catch {
            isSaving = false
            handleSaveFailure(error)
            return
        }
        isSaving = false
        generation += 1
        show(updated)
        announcement = "Categoría guardada"
        onChange()
    }

    private func handleSaveFailure(_ error: any Error) {
        switch error {
        case APIError.sessionExpired:
            break
        case CategoriaError.notFound:
            gone()
        case CategoriaError.isInternal:
            refusedAsInternal = true
            fieldErrors = DetalleCategoriaPresentation.categoryErrors(for: error)
        default:
            fieldErrors = DetalleCategoriaPresentation.categoryErrors(for: error)
        }
    }

    /// The category is not there any more: this screen has nothing to show, the lists must re-read.
    private func gone() {
        generation += 1
        state = .notFound
        onChange()
    }

    // MARK: deleting the category

    func requestDeletion() {
        guard category != nil, !isProtected, !isDeleting else { return }
        pendingDeletion = true
    }

    func cancelDeletion() { pendingDeletion = false }

    func confirmDeletion() async {
        guard pendingDeletion, let category, !isProtected, !isDeleting else { return }
        pendingDeletion = false
        isDeleting = true
        notice = nil
        announcement = nil
        do {
            try await api.eliminarCategoria(id: category.id)
        } catch CategoriaError.notFound {
            // Already gone: the same result, said by the list instead of by this screen.
            isDeleting = false
            isGone = true
            onChange()
            return
        } catch CategoriaError.isInternal {
            isDeleting = false
            refusedAsInternal = true
            fieldErrors = DetalleCategoriaPresentation.categoryErrors(for: CategoriaError.isInternal)
            return
        } catch {
            isDeleting = false
            if case APIError.sessionExpired = error { return }
            notice = DetalleCategoriaPresentation.deleteFailure(error, what: "la categoría")
            return
        }
        isDeleting = false
        isGone = true
        onChange()
        onDeleted(category.nombre)
    }

    // MARK: leaving with unsaved changes

    func askToDiscard() {
        guard hasChanges else { return }
        pendingDiscard = true
    }

    func cancelDiscard() { pendingDiscard = false }

    func discardChanges() {
        pendingDiscard = false
        if let category { show(category) }
        fieldErrors = FieldErrors()
    }

    // MARK: patterns

    /// The type the pattern sheet starts on: the pattern's own (even one the app does not know),
    /// «Contiene» for a new one.
    var patternSheetMatchType: MatchType {
        if case .editing(let pattern) = patternSheet { return pattern.matchType }
        return .contains
    }

    func beginAddPattern() {
        guard category != nil, !isProtected, !isSavingPattern else { return }
        patternErrors = PatternErrors()
        patternSheet = .adding
    }

    func beginEditPattern(_ pattern: PatronCategoria) {
        guard category != nil, !isProtected, !isSavingPattern else { return }
        patternErrors = PatternErrors()
        patternSheet = .editing(pattern)
    }

    func dismissPatternSheet() {
        guard !isSavingPattern else { return }
        patternSheet = nil
        patternErrors = PatternErrors()
    }

    /// "Guardar" in the pattern sheet: a new pattern, or only what changed of an existing one.
    func savePattern(text: String, matchType: MatchType) async {
        guard let category, let sheet = patternSheet, !isSavingPattern else { return }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        isSavingPattern = true
        patternErrors = PatternErrors()
        let saved: PatronCategoria
        do {
            switch sheet {
            case .adding:
                saved = try await api.crearPatron(categoriaId: category.id, patron: trimmed, matchType: matchType)
            case .editing(let current):
                var changes = PatronCambios()
                if trimmed != current.patron { changes.patron = trimmed }
                if matchType != current.matchType { changes.matchType = matchType }
                guard !changes.isEmpty else {
                    isSavingPattern = false
                    patternSheet = nil
                    return
                }
                saved = try await api.actualizarPatron(id: current.id, cambios: changes)
            }
        } catch {
            isSavingPattern = false
            handlePatternFailure(error, sheet: sheet)
            return
        }
        isSavingPattern = false
        patternSheet = nil
        generation += 1
        switch sheet {
        case .adding: replacePatterns { $0 + [saved] }
        case .editing(let current): replacePatterns { $0.map { $0.id == current.id ? saved : $0 } }
        }
        announcement = "Patrón guardado"
        onChange()
    }

    private func handlePatternFailure(_ error: any Error, sheet: PatternSheet) {
        switch error {
        case APIError.sessionExpired:
            break
        case PatronError.categoryNotFound:
            patternSheet = nil
            gone()
        case PatronError.patternNotFound:
            patternSheet = nil
            if case .editing(let current) = sheet { replacePatterns { $0.filter { $0.id != current.id } } }
            notice = "Ese patrón ya no existe"
            onChange()
        default:
            patternErrors = DetalleCategoriaPresentation.patternErrors(for: error)
        }
    }

    func requestPatternDeletion(_ pattern: PatronCategoria) {
        guard !isProtected, deletingPattern == nil else { return }
        pendingPatternDeletion = pattern
    }

    func cancelPatternDeletion() { pendingPatternDeletion = nil }

    func confirmPatternDeletion() async {
        guard let pattern = pendingPatternDeletion, deletingPattern == nil else { return }
        pendingPatternDeletion = nil
        deletingPattern = pattern.id
        notice = nil
        announcement = nil
        defer { deletingPattern = nil }
        do {
            try await api.eliminarPatron(id: pattern.id)
        } catch PatronError.patternNotFound {
            replacePatterns { $0.filter { $0.id != pattern.id } }
            onChange()
            return
        } catch {
            if case APIError.sessionExpired = error { return }
            notice = DetalleCategoriaPresentation.deleteFailure(error, what: "el patrón")
            return
        }
        generation += 1
        replacePatterns { $0.filter { $0.id != pattern.id } }
        announcement = "Patrón eliminado"
        onChange()
    }

    private func replacePatterns(_ change: ([PatronCategoria]) -> [PatronCategoria]) {
        guard let current = category else { return }
        state = .loaded(CategoriaCatalogo(
            id: current.id, nombre: current.nombre, bucket: current.bucket, icono: current.icono,
            transaccionesCount: current.transaccionesCount, esInterna: current.esInterna,
            patrones: change(current.patrones)
        ))
    }

    // MARK: internals

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
}
