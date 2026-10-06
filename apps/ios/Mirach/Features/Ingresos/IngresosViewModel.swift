import Foundation
import Observation

/// State of "Ingresos del mes": the incomes of one month at a time. Read-only.
@MainActor
@Observable
final class IngresosViewModel {
    enum Failure: Equatable {
        /// No answer from the server (offline, timeout).
        case connection
        /// The server answered with something the app cannot use (5xx, unexpected body).
        case server
    }

    enum State: Equatable {
        case loading
        case loaded(IngresosMes)
        case failed(Failure)
    }

    private(set) var state: State = .loading
    /// The month on screen (or being loaded).
    private(set) var periodo: Periodo
    /// Months with movements, most recent first. Empty until loaded or if that call failed:
    /// the list does not depend on it.
    private(set) var periodos: [Periodo] = []

    private let api: any MirachAPI
    /// Bumped on every request so a late answer for an older choice is dropped.
    private var generation = 0
    private var needsLoad = true

    init(api: any MirachAPI, periodo: Periodo) {
        self.api = api
        self.periodo = periodo
    }

    /// The next older month that has data (the list is most recent first), if any.
    var anterior: Periodo? { neighbour(offset: 1) }
    /// The next newer month that has data, if any.
    var siguiente: Periodo? { neighbour(offset: -1) }

    /// Runs `load()` unless the screen already finished one: its task restarts on every
    /// appearance, and one cancelled midway (the screen went away) must run again.
    func loadIfNeeded() async {
        guard needsLoad else { return }
        await load()
    }

    func load() async {
        state = .loading
        async let months = fetchPeriodos()
        await fetch(periodo: periodo)
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

    /// Any answer that is still current (also from `retry`, `refresh` or `select`) marks the screen
    /// as loaded; a cancelled call does not, so the next appearance runs again.
    /// `true`: the list on screen is now fresh. `false`: the request failed. `nil`: a newer
    /// request took over (or the call was cancelled), so there is nothing to report.
    @discardableResult
    private func fetch(periodo: Periodo, keepingContentOnFailure: Bool = false) async -> Bool? {
        self.periodo = periodo
        generation += 1
        let mine = generation
        do {
            let ingresos = try await api.ingresosMes(periodo: periodo)
            guard mine == generation else { return nil }
            needsLoad = false
            state = .loaded(ingresos)
            return true
        } catch {
            guard mine == generation, let failure = Self.failure(for: error) else { return nil }
            needsLoad = false
            if !keepingContentOnFailure { state = .failed(failure) }
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
}
