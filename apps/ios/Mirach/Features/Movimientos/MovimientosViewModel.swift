import Foundation
import Observation

/// State of the «Movimientos» tab: one month and the three bucket panes of it. Each pane is a
/// `DetalleBucketViewModel` (its list, its sheet to move a movement, its «Cambiar de grupo»
/// confirmation, which compares with the bucket the movement is in), so the move flow is the
/// bucket detail's. This type adds what only the tab has: the month, the three requests together,
/// which pane is open, and the notice with «Deshacer».
@MainActor
@Observable
final class MovimientosViewModel {
    typealias Failure = DetalleBucketViewModel.Failure

    enum State: Equatable {
        case loading
        case loaded
        case failed(Failure)
    }

    /// What it takes to put a movement back where it was: the same reclassify call.
    struct Undo: Equatable {
        let transaccionId: String
        let categoriaId: String
    }

    enum Notice: Equatable {
        /// «Movido a …», with «Deshacer» when it can be undone.
        case moved(String, undo: Undo?)
        case failure(String)
    }

    private(set) var state: State = .loading
    /// The month on screen (or being loaded).
    private(set) var periodo: Periodo
    /// Months with movements, most recent first.
    private(set) var periodos: [Periodo] = []
    /// Necesidades, Gustos, Ahorro: always the three, in that order.
    let panes: [DetalleBucketViewModel]
    /// The one bucket whose movements are showing; the other two show only their header. It stays
    /// through a month change, a move and a reload.
    private(set) var openBucket: Bucket = Bucket.allCases[0]
    private(set) var notice: Notice?
    private(set) var isUndoing = false

    private let api: any MirachAPI
    /// Told once per successful move or undo: the Resumen's figures changed too.
    private let onChanged: @MainActor () -> Void
    private var needsLoad = true
    private var monthsResolved = false

    init(api: any MirachAPI, today: Periodo = .current, onChanged: @escaping @MainActor () -> Void = {}) {
        self.api = api
        self.periodo = today
        self.onChanged = onChanged
        // `self` does not exist yet: the panes tell it about moves through a box filled right after.
        let box = Box()
        panes = Bucket.allCases.map { bucket in
            DetalleBucketViewModel(
                api: api, bucket: bucket, periodo: today, onReclassified: onChanged,
                onMoved: { move in await box.owner?.didMove(move, from: bucket) }
            )
        }
        box.owner = self
    }

    @MainActor private final class Box {
        weak var owner: MovimientosViewModel?
    }

    func pane(_ bucket: Bucket) -> DetalleBucketViewModel {
        panes.first { $0.bucket == bucket }!
    }

    /// Shows the movements of `bucket` and closes the bucket that was open.
    func open(_ bucket: Bucket) {
        openBucket = bucket
    }

    /// The tab's notice, or else the first pane's (the list is out of date, the movement is gone).
    var displayedNotice: Notice? {
        notice ?? panes.lazy.compactMap(\.notice).first.map(Notice.failure)
    }

    /// The pane whose sheet is open, if any.
    var sheetPane: DetalleBucketViewModel? { panes.first { $0.sheetMovement != nil } }

    var anterior: Periodo? { neighbour(offset: 1) }
    var siguiente: Periodo? { neighbour(offset: -1) }

    private func neighbour(offset: Int) -> Periodo? {
        guard let index = periodos.firstIndex(of: periodo) else { return nil }
        let target = index + offset
        return periodos.indices.contains(target) ? periodos[target] : nil
    }

    // MARK: loading

    /// Runs `load()` unless a load already finished: the task restarts on every appearance.
    func loadIfNeeded() async {
        guard needsLoad else { return }
        await load()
    }

    /// Resolves the month once (the most recent with data), then asks for the three buckets of it.
    func load() async {
        state = .loading
        notice = nil
        do {
            periodos = try await api.periodos()
            monthsResolved = true
        } catch {
            if let failure = DetalleBucketViewModel.failure(for: error) { needsLoad = false; state = .failed(failure) }
            return
        }
        await show(periodos.first ?? periodo)
    }

    /// «Reintentar»: the same requests; the month is resolved again only if that was what failed.
    func retry() async {
        guard monthsResolved else { return await load() }
        state = .loading
        await show(periodo)
    }

    /// Pull to refresh: the three again, keeping what is on screen if one fails.
    func refresh() async {
        guard state == .loaded else { return await retry() }
        await eachPane { await $0.refresh() }
    }

    /// An import, a deleted statement, a saved profile: the months and the panes are read again.
    func reload() async {
        guard !needsLoad else { return await load() }
        if let months = try? await api.periodos() { periodos = months }
        await refresh()
    }

    /// A category was written elsewhere: the groups and the sheets' catalogs are stale.
    func catalogDidChange() async {
        await eachPane { await $0.catalogDidChange() }
    }

    func select(_ periodo: Periodo) async {
        notice = nil
        state = .loading
        await show(periodo)
    }

    private func show(_ periodo: Periodo) async {
        self.periodo = periodo
        await eachPane { await $0.select(periodo) }
        settle()
    }

    /// One state for the screen from the three answers: an error if any failed.
    private func settle() {
        let states = panes.map(\.state)
        for case .failed(let failure) in states {
            needsLoad = false
            state = .failed(failure)
            return
        }
        // A pane still loading was cancelled (the screen went away): the next appearance runs again.
        let done = states.allSatisfy { if case .loaded = $0 { true } else { false } }
        needsLoad = !done
        state = done ? .loaded : .loading
    }

    private func eachPane(_ work: @escaping @MainActor (DetalleBucketViewModel) async -> Void) async {
        await withTaskGroup(of: Void.self) { group in
            for pane in panes { group.addTask { await work(pane) } }
        }
    }

    // MARK: moving

    /// A pane saved a move: say so, and read the other two (the movement may have changed bucket).
    /// The pane reads itself right after this returns.
    private func didMove(_ move: DetalleBucketViewModel.Move, from bucket: Bucket) async {
        // The API cannot put back a movement that had no category, nor one of a move that carried
        // similar movements and saved a pattern.
        let undo = move.appliedToSimilar ? nil : move.previousCategoryId.map {
            Undo(transaccionId: move.movement.id, categoriaId: $0)
        }
        notice = .moved(MovimientosPresentation.moved(move.result), undo: undo)
        let others = panes.filter { $0.bucket != bucket }
        await withTaskGroup(of: Void.self) { group in
            for pane in others { group.addTask { await pane.refresh() } }
        }
    }

    /// «Deshacer»: the same reclassify call, back to the previous category.
    func undo() async {
        guard case .moved(_, let undo?) = notice, !isUndoing else { return }
        isUndoing = true
        defer { isUndoing = false }
        do {
            _ = try await api.reclasificar(transaccionId: undo.transaccionId, categoriaId: undo.categoriaId)
        } catch {
            switch DetalleBucketViewModel.failure(for: error) {
            case nil: break
            case .connection?: notice = .failure(MovimientosPresentation.undoFailed(connection: true))
            case .server?: notice = .failure(MovimientosPresentation.undoFailed(connection: false))
            }
            return
        }
        notice = nil
        onChanged()
        await eachPane { await $0.refresh() }
    }
}

extension Periodo {
    /// The calendar month today, for a person with no month that has data.
    static var current: Periodo {
        let parts = Calendar(identifier: .gregorian).dateComponents([.year, .month], from: Date())
        return Periodo("\(parts.year!)-\(parts.month! < 10 ? "0" : "")\(parts.month!)")!
    }
}
