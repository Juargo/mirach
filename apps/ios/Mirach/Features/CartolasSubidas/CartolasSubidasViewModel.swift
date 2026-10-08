import Foundation
import Observation

/// State of "Cartolas subidas": the user's imports, and deleting one at a time.
@MainActor
@Observable
final class CartolasSubidasViewModel {
    enum Failure: Equatable {
        /// No answer from the server (offline, timeout).
        case connection
        /// The server answered with something the app cannot use (5xx, unexpected body).
        case server
    }

    enum State: Equatable {
        case loading
        /// An empty list is a loaded one: the screen offers to upload.
        case loaded([CartolaSubida])
        case failed(Failure)
    }

    /// What the last deletion left to say.
    enum Message: Equatable {
        case deleted
        case alreadyGone
        case failed

        var text: String {
            switch self {
            case .deleted: "Cartola eliminada"
            case .alreadyGone: "Esa cartola ya no existía. Se quitó de la lista."
            case .failed: "No se pudo eliminar la cartola. Intenta nuevamente."
            }
        }
    }

    private(set) var state: State = .loading
    /// Set when a refresh failed and the list on screen is the previous answer.
    private(set) var refreshNotice: String?
    /// The import waiting for the person's confirmation.
    private(set) var pendingDeletion: CartolaSubida?
    /// Imports whose deletion the server has not answered yet: their rows are disabled.
    private(set) var deleting: Set<String> = []
    private(set) var message: Message?

    private let api: any MirachAPI
    /// Told after the data behind the other screens changed (an import is gone).
    private let onChange: @MainActor () -> Void
    /// Bumped on every request so a late answer for an older one is dropped.
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
        await fetch()
    }

    /// "Reintentar": the same query that failed, again.
    func retry() async { await load() }

    /// Pull to refresh: repeats the query without blanking the list, and keeps it if it fails.
    func refresh() async {
        guard case .loaded = state else { return await retry() }
        await fetch(keepingContentOnFailure: true)
    }

    // MARK: deleting

    func requestDeletion(_ cartola: CartolaSubida) {
        guard !deleting.contains(cartola.id) else { return }
        pendingDeletion = cartola
    }

    func cancelDeletion() { pendingDeletion = nil }

    func dismissMessage() { message = nil }

    /// Takes the import explicitly: the alert clears `pendingDeletion` as it closes, before the
    /// task that runs this starts.
    func confirmDeletion(_ cartola: CartolaSubida) async {
        pendingDeletion = nil
        guard !deleting.contains(cartola.id) else { return }
        deleting.insert(cartola.id)
        message = nil
        defer { deleting.remove(cartola.id) }
        do {
            try await api.eliminarCartola(id: cartola.id)
            await removed(cartola, saying: .deleted)
        } catch EliminarCartolaError.notFound {
            await removed(cartola, saying: .alreadyGone)
        } catch {
            // A 401 is handled by the single relay; a cancelled call says nothing.
            if Self.failure(for: error) != nil { message = .failed }
        }
    }

    /// The import is gone: drop its row, let the other screens know, and read the list again
    /// (that request supersedes any made before the deletion, which would bring the row back).
    private func removed(_ cartola: CartolaSubida, saying message: Message) async {
        if case .loaded(let list) = state { state = .loaded(list.filter { $0.id != cartola.id }) }
        self.message = message
        onChange()
        await fetch(keepingContentOnFailure: true)
    }

    /// Any answer that is still current marks the screen as loaded; a cancelled call does not,
    /// so the next appearance runs again. A newer request (or cancellation) reports nothing.
    private func fetch(keepingContentOnFailure: Bool = false) async {
        generation += 1
        let mine = generation
        do {
            let list = try await api.cartolasSubidas()
            guard mine == generation else { return }
            needsLoad = false
            state = .loaded(list)
            refreshNotice = nil
        } catch {
            guard mine == generation, let failure = Self.failure(for: error) else { return }
            needsLoad = false
            if keepingContentOnFailure {
                refreshNotice = "No se pudo actualizar la lista."
            } else {
                state = .failed(failure)
            }
        }
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
