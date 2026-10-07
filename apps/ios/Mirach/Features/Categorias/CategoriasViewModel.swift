import Foundation
import Observation

/// State of "Categorías": the user's catalog grouped by bucket, and creating a category.
@MainActor
@Observable
final class CategoriasViewModel {
    enum Failure: Equatable {
        /// No answer from the server (offline, timeout).
        case connection
        /// The server answered with something the app cannot use (5xx, unexpected body).
        case server
    }

    enum State: Equatable {
        case loading
        /// An empty catalog is a loaded one: the three groups say «Sin categorías».
        case loaded(CatalogoCategorias)
        case failed(Failure)
    }

    private(set) var state: State = .loading
    /// Set when a refresh failed and the list on screen is the previous answer.
    private(set) var refreshNotice: String?
    private(set) var isCreating = false
    private(set) var formErrors = SubirCartolaViewModel.CategoryFormErrors()
    /// Grows by one with every category created: the form closes when it changes.
    private(set) var createdCount = 0
    /// What VoiceOver announces after a creation: «Categoría «Mascotas» creada».
    private(set) var announcement: String?

    private let api: any MirachAPI
    /// Told once per successful write: Resumen, bucket detail and the review catalog are stale.
    private let onChange: @MainActor () -> Void
    /// Bumped on every request (and write) so a late answer for an older one is dropped.
    private var generation = 0
    private var needsLoad = true

    init(api: any MirachAPI, onChange: @escaping @MainActor () -> Void = {}) {
        self.api = api
        self.onChange = onChange
    }

    /// Runs `load()` unless the screen already finished one: its task restarts on every
    /// appearance, and one cancelled midway (the screen went away) must run again.
    func loadIfNeeded() async {
        guard needsLoad else { return }
        await load()
    }

    func load() async {
        state = .loading
        refreshNotice = nil
        announcement = nil
        await fetch()
    }

    /// "Reintentar": the same query that failed, again.
    func retry() async { await load() }

    /// Pull to refresh: repeats the query without blanking the list, and keeps it if it fails.
    func refresh() async {
        guard case .loaded = state else { return await retry() }
        // The person asked for the list again: what was announced about an earlier write is stale.
        // (The re-read a write triggers itself, `catalogDidChange`, keeps its announcement.)
        announcement = nil
        await fetch(keepingContentOnFailure: true, failureNotice: "No se pudo actualizar la lista.")
    }

    /// The catalog changed (here or in a category's detail): read it again. A failure says the
    /// change did apply, so nobody repeats it.
    func catalogDidChange() async {
        guard case .loaded = state else { return }
        await fetch(
            keepingContentOnFailure: true,
            failureNotice: "El cambio se aplicó, pero no pudimos actualizar la lista. Desliza hacia abajo para actualizar."
        )
    }

    // MARK: creating

    /// Called when the form opens: clears the errors of a previous attempt.
    func resetForm() {
        formErrors = SubirCartolaViewModel.CategoryFormErrors()
    }

    func dismissAnnouncement() { announcement = nil }

    /// The detail deleted a category and the person is back on the list.
    func announceDeletion(of name: String) {
        announcement = "Categoría «\(name)» eliminada"
    }

    /// "Crear" in the form. On success the category joins its group at once, the form closes
    /// (`createdCount` changes) and the other screens are told. On failure the form stays.
    func create(_ new: NuevaCategoria) async {
        guard case .loaded(let catalog) = state, !isCreating else { return }
        isCreating = true
        formErrors = SubirCartolaViewModel.CategoryFormErrors()
        announcement = nil
        let category: CategoriaCatalogo
        do {
            category = try await api.crearCategoria(new)
        } catch {
            isCreating = false
            if case APIError.sessionExpired = error { return }
            formErrors = SubirCartolaViewModel.formErrors(for: error)
            return
        }
        isCreating = false
        // A read that started before the creation must not take the new category away.
        generation += 1
        state = .loaded(CatalogoCategorias(categorias: Self.inserting(category, into: catalog.categorias)))
        announcement = "Categoría «\(category.nombre)» creada"
        createdCount += 1
        onChange()
    }

    // MARK: internals

    /// Any answer that is still current marks the screen as loaded; a cancelled call does not,
    /// so the next appearance runs again. A newer request (or cancellation) reports nothing.
    private func fetch(keepingContentOnFailure: Bool = false, failureNotice: String = "") async {
        generation += 1
        let mine = generation
        do {
            let catalog = try await api.categorias()
            guard mine == generation else { return }
            needsLoad = false
            state = .loaded(catalog)
            refreshNotice = nil
        } catch {
            guard mine == generation, let failure = Self.failure(for: error) else { return }
            needsLoad = false
            if keepingContentOnFailure {
                refreshNotice = failureNotice
            } else {
                state = .failed(failure)
            }
        }
    }

    /// The API orders by name and the app keeps that order; a created one is placed by the same
    /// rule, before the first category of its bucket that sorts after it.
    private static func inserting(_ category: CategoriaCatalogo, into list: [CategoriaCatalogo]) -> [CategoriaCatalogo] {
        var next = list
        let index = next.firstIndex {
            $0.bucket == category.bucket && $0.nombre.localizedCaseInsensitiveCompare(category.nombre) == .orderedDescending
        }
        next.insert(category, at: index ?? next.endIndex)
        return next
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
}
