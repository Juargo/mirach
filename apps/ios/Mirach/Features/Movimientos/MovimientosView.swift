import SwiftUI

/// «Movimientos»: the month's movements in three fixed bucket panes, each one scrolling on its
/// own, every movement with a visible «Mover» button. At accessibility text sizes the panes stop
/// being fixed and the screen is one scrolling list, so nothing is clipped.
struct MovimientosView: View {
    @State private var viewModel: MovimientosViewModel
    @Environment(\.dynamicTypeSize) private var typeSize
    /// Changes when an import, a deleted statement or a saved profile made the data stale.
    private let reloadToken: Int
    /// Changes whenever the catalog was written anywhere.
    private let catalogRevision: Int

    init(api: any MirachAPI, reloadToken: Int, catalogRevision: Int, onChanged: @escaping @MainActor () -> Void) {
        self.reloadToken = reloadToken
        self.catalogRevision = catalogRevision
        _viewModel = State(initialValue: MovimientosViewModel(api: api, onChanged: onChanged))
    }

    var body: some View {
        NavigationStack {
            content
                .background(Color.Mirach.Base.background.ignoresSafeArea(.all))
                .navigationTitle(MovimientosPresentation.title)
                .navigationBarTitleDisplayMode(.inline)
        }
        .task { await viewModel.loadIfNeeded() }
        .onChange(of: reloadToken) { Task { await viewModel.reload() } }
        .onChange(of: catalogRevision) { Task { await viewModel.catalogDidChange() } }
        .sheet(isPresented: Binding(
            get: { viewModel.sheetPane != nil },
            set: { if !$0 { viewModel.sheetPane?.dismissSheet() } }
        )) {
            if let pane = viewModel.sheetPane {
                ReclasificarSheet(viewModel: pane)
                    .interactiveDismissDisabled(pane.reclassifyingId != nil)
            }
        }
        .onChange(of: viewModel.notice) {
            if case .moved(let text, _)? = viewModel.notice { AccessibilityNotification.Announcement(text).post() }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading:
            VStack(spacing: MirachSpacing.m) {
                ProgressView()
                Text(MovimientosPresentation.loading)
                    .mirachText(.cuerpo)
                    .foregroundStyle(Color.Mirach.Base.mutedForeground)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("movimientos.loading")
        case .failed(let failure):
            VStack(spacing: MirachSpacing.m) {
                Text(DetalleBucketPresentation.failureMessage(failure))
                    .mirachText(.cuerpo)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.Mirach.Feedback.errorText)
                Button("Reintentar") { Task { await viewModel.retry() } }
                    .prominentButton()
                    .accessibilityIdentifier("movimientos.retry")
            }
            .padding(.horizontal, MirachSpacing.l)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .accessibilityIdentifier("movimientos.error")
        case .loaded:
            if typeSize.isAccessibilitySize {
                ScrollView {
                    VStack(spacing: MirachSpacing.m) { loaded(fixedPanes: false) }
                        .padding(MirachSpacing.m)
                }
                .refreshable { await viewModel.refresh() }
            } else {
                VStack(spacing: MirachSpacing.s) { loaded(fixedPanes: true) }
                    .padding(.horizontal, MirachSpacing.m)
                    .padding(.bottom, MirachSpacing.s)
            }
        }
    }

    @ViewBuilder
    private func loaded(fixedPanes: Bool) -> some View {
        MonthSelector(
            periodo: viewModel.periodo,
            anterior: viewModel.anterior,
            siguiente: viewModel.siguiente,
            select: { periodo in Task { await viewModel.select(periodo) } },
            idPrefix: "movimientos",
            titleFont: .mirach(.cuerpoDestacado)
        )
        if let notice = viewModel.displayedNotice {
            NoticeStrip(notice: notice, isUndoing: viewModel.isUndoing) { Task { await viewModel.undo() } }
        }
        ForEach(viewModel.panes, id: \.bucket) { pane in
            BucketPane(
                viewModel: pane, isFixed: fixedPanes,
                canMove: viewModel.panes.allSatisfy { $0.reclassifyingId == nil },
                refresh: { await viewModel.refresh() }
            )
        }
    }
}

/// «Movido a …» with «Deshacer», or what went wrong. The icon and the words carry the meaning,
/// not the colour; VoiceOver hears it through the announcement the screen posts.
private struct NoticeStrip: View {
    let notice: MovimientosViewModel.Notice
    let isUndoing: Bool
    let undo: () -> Void

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: MirachSpacing.m) {
            Label(text, systemImage: isFailure ? "exclamationmark.triangle" : "checkmark.circle")
                .mirachText(.etiqueta)
                .foregroundStyle(isFailure ? Color.Mirach.Feedback.errorText : Color.Mirach.Feedback.successText)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(text)
                .accessibilityIdentifier("movimientos.notice")
            if case .moved(_, .some) = notice {
                Button(MovimientosPresentation.undo, action: undo)
                    .mirachText(.etiqueta)
                    .foregroundStyle(Color.Mirach.Base.foreground)
                    .frame(minWidth: 44, minHeight: 44)
                    .disabled(isUndoing)
                    .accessibilityHint("Devuelve el movimiento a su categoría anterior")
                    .accessibilityIdentifier("movimientos.undo")
            }
        }
        .padding(.horizontal, MirachSpacing.m)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .background(Color.Mirach.Base.card, in: Rectangle())
        .overlay(Rectangle().strokeBorder(Color.Mirach.Base.border, lineWidth: 1))
    }

    private var isFailure: Bool {
        if case .failure = notice { true } else { false }
    }

    private var text: String {
        switch notice {
        case .moved(let text, _), .failure(let text): text
        }
    }
}

/// One bucket: its colour bar, «{total} · {porcentaje}», and its categories and movements.
private struct BucketPane: View {
    let viewModel: DetalleBucketViewModel
    /// A fixed pane scrolls inside; otherwise it is as tall as its content.
    let isFixed: Bool
    let canMove: Bool
    let refresh: () async -> Void

    var body: some View {
        VStack(spacing: 0) {
            Rectangle().fill(viewModel.bucket.fill).frame(height: 6).accessibilityHidden(true)
            header
            Divider().overlay(Color.Mirach.Base.border)
            if isFixed {
                ScrollView { rows }.refreshable { await refresh() }
            } else {
                rows
            }
        }
        .frame(maxHeight: isFixed ? .infinity : nil)
        .overlay(Rectangle().strokeBorder(Color.Mirach.Base.border, lineWidth: 1))
        .accessibilityIdentifier("movimientos.pane.\(viewModel.bucket.apiName)")
    }

    @ViewBuilder
    private var header: some View {
        if case .loaded(let detalle) = viewModel.state {
            HStack(alignment: .firstTextBaseline, spacing: MirachSpacing.s) {
                Text(viewModel.bucket.label).mirachText(.cuerpoDestacado)
                Spacer(minLength: MirachSpacing.s)
                Text(MovimientosPresentation.paneHeader(detalle)).mirachText(.cuerpoDestacado).mirachFigures()
            }
            .foregroundStyle(Color.Mirach.Base.foreground)
            .padding(.horizontal, MirachSpacing.m)
            .padding(.vertical, MirachSpacing.s)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(MovimientosPresentation.paneLabel(detalle))
            .accessibilityAddTraits(.isHeader)
            .accessibilityIdentifier("movimientos.header.\(viewModel.bucket.apiName)")
        }
    }

    @ViewBuilder
    private var rows: some View {
        if case .loaded(let detalle) = viewModel.state {
            if detalle.grupos.isEmpty {
                Text(MovimientosPresentation.emptyPane)
                    .mirachText(.cuerpo)
                    .foregroundStyle(Color.Mirach.Base.mutedForeground)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .padding(MirachSpacing.m)
                    .accessibilityIdentifier("movimientos.empty.\(viewModel.bucket.apiName)")
            } else {
                // Lazy: a month can hold hundreds of movements.
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(detalle.grupos) { group in
                        CategoryRow(group: group, bucket: viewModel.bucket)
                        ForEach(group.transacciones) { movement in
                            MovementRow(movement: movement, canMove: canMove) {
                                Task { await viewModel.beginReclassify(movement) }
                            }
                        }
                    }
                }
            }
        }
    }
}

/// A category of the bucket: a tile in the bucket colour with its icon, the name, how many
/// movements and the subtotal. Not a button on this screen.
private struct CategoryRow: View {
    let group: GrupoCategoria
    let bucket: Bucket
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        HStack(spacing: MirachSpacing.s) {
            Image(systemName: CategoryIcon.symbol(for: group.icono))
                .foregroundStyle(Color.Mirach.Base.background)
                .frame(width: 36, height: 36)
                .background(bucket.fill, in: Rectangle())
                .accessibilityHidden(true)
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: MirachSpacing.xs) { name; subtotal }
            } else {
                name
                Spacer(minLength: MirachSpacing.s)
                subtotal
            }
        }
        .padding(.horizontal, MirachSpacing.m)
        .padding(.vertical, MirachSpacing.s)
        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
        .background(Color.Mirach.Base.card)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(MovimientosPresentation.groupLabel(group))
        .accessibilityAddTraits(.isHeader)
        .accessibilityIdentifier("movimientos.group.\(group.id)")
    }

    private var name: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(group.nombre).mirachText(.cuerpoDestacado).foregroundStyle(Color.Mirach.Base.foreground)
            Text(DetalleBucketPresentation.movements(group.conteo))
                .mirachText(.etiqueta)
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
        }
    }

    private var subtotal: some View {
        Text(Format.money(group.subtotal))
            .mirachText(.cuerpoDestacado)
            .mirachFigures()
            .foregroundStyle(Color.Mirach.Base.foreground)
    }
}

/// A movement under its category: the whole description (it wraps), the date, the amount and a
/// visible «Mover». The row itself does nothing when tapped; only the button acts.
private struct MovementRow: View {
    let movement: MovimientoBucket
    let canMove: Bool
    let move: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(spacing: 0) {
            Group {
                if typeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: MirachSpacing.s) { text; amount; button }
                } else {
                    HStack(alignment: .top, spacing: MirachSpacing.s) {
                        text
                        VStack(alignment: .trailing, spacing: MirachSpacing.xs) { amount; button }
                    }
                }
            }
            .padding(.leading, MirachSpacing.m + 36 + MirachSpacing.s)
            .padding(.trailing, MirachSpacing.m)
            .padding(.vertical, MirachSpacing.s)
            Divider().overlay(Color.Mirach.Base.border)
        }
    }

    private var text: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(movement.descripcion)
                .mirachText(.cuerpo)
                .foregroundStyle(Color.Mirach.Base.foreground)
            Text(Format.shortDate(movement.fecha))
                .mirachText(.etiqueta)
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(MovimientosPresentation.rowLabel(movement))
        .accessibilityIdentifier("movimientos.row.\(movement.id)")
    }

    private var amount: some View {
        Text(Format.money(movement.monto))
            .mirachText(.cuerpoDestacado)
            .mirachFigures()
            .foregroundStyle(Color.Mirach.Base.foreground)
            .accessibilityHidden(true)
    }

    private var button: some View {
        Button(action: move) {
            Text(MovimientosPresentation.move)
                .mirachText(.etiqueta)
                .foregroundStyle(Color.Mirach.Base.foreground)
                .padding(.horizontal, MirachSpacing.m)
                .frame(minWidth: 44, minHeight: 44)
                .overlay(Rectangle().strokeBorder(Color.Mirach.Base.input, lineWidth: 1))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!canMove)
        .opacity(canMove ? 1 : 0.4)
        .accessibilityHint(MovimientosPresentation.moveHint(movement))
        .accessibilityIdentifier("movimientos.move.\(movement.id)")
    }
}
