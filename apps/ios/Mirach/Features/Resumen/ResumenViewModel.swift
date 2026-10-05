import Foundation
import Observation

/// State of "Resumen del mes": one month at a time, plus the list of months for the arrows.
@MainActor
@Observable
final class ResumenViewModel {
    enum Failure: Equatable {
        /// No answer from the server (offline, timeout).
        case connection
        /// The server answered with something the app cannot use (5xx, unexpected body).
        case server
    }

    enum State: Equatable {
        case loading
        case loaded(ResumenMes)
        case failed(Failure)
    }

    private(set) var state: State = .loading
    /// Months with movements, most recent first. Empty until loaded or if that call failed:
    /// the summary does not depend on it.
    private(set) var periodos: [Periodo] = []

    private let api: any MirachAPI
    /// The month asked for; `nil` lets the API choose the latest one (first load).
    private var requested: Periodo?
    /// Bumped on every request so a late answer for an older choice is dropped.
    private var generation = 0

    init(api: any MirachAPI) {
        self.api = api
    }

    /// The next older month that has data (the list is most recent first), if any.
    var anterior: Periodo? { neighbour(offset: 1) }
    /// The next newer month that has data, if any.
    var siguiente: Periodo? { neighbour(offset: -1) }

    /// First load: the API picks the month; the month list loads alongside.
    func load() async {
        requested = nil
        state = .loading
        async let months = fetchPeriodos()
        await fetch(periodo: nil)
        if let months = await months { periodos = months }
    }

    /// "Reintentar": the same query that failed, again.
    func retry() async {
        state = .loading
        await fetch(periodo: requested)
        if periodos.isEmpty, let months = await fetchPeriodos() { periodos = months }
    }

    /// Pull to refresh: repeats the query for the month on screen without blanking it,
    /// and keeps the old month if the refresh fails.
    func refresh() async {
        guard case .loaded(let current) = state else { return await retry() }
        await fetch(periodo: current.periodo, keepingContentOnFailure: true)
        if let months = await fetchPeriodos() { periodos = months }
    }

    func select(_ periodo: Periodo) async {
        state = .loading
        await fetch(periodo: periodo)
    }

    private func neighbour(offset: Int) -> Periodo? {
        guard case .loaded(let current) = state, let index = periodos.firstIndex(of: current.periodo) else {
            return nil
        }
        let target = index + offset
        return periodos.indices.contains(target) ? periodos[target] : nil
    }

    private func fetch(periodo: Periodo?, keepingContentOnFailure: Bool = false) async {
        requested = periodo
        generation += 1
        let mine = generation
        do {
            let mes = try await api.resumen(periodo: periodo)
            guard mine == generation else { return }
            state = .loaded(mes)
        } catch {
            guard mine == generation, !keepingContentOnFailure else { return }
            if let failure = Self.failure(for: error) { state = .failed(failure) }
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
