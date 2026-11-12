import SwiftUI

/// "Detalle de bucket": a bucket's movements for a month, grouped by category. Tapping a
/// movement opens a sheet to move it to another category.
struct DetalleBucketView: View {
    @State private var viewModel: DetalleBucketViewModel
    @Environment(\.dynamicTypeSize) private var typeSize
    private let api: any MirachAPI
    /// Changes whenever the catalog was written anywhere: the groups and the sheet are stale.
    private let catalogRevision: Int
    /// A category opened from a group header may write the catalog: the other screens must know.
    private let onCatalogChange: @MainActor () -> Void

    init(
        api: any MirachAPI, bucket: Bucket, periodo: Periodo, catalogRevision: Int = 0,
        onReclassified: @escaping @MainActor () -> Void, onCatalogChange: @escaping @MainActor () -> Void = {}
    ) {
        self.api = api
        self.catalogRevision = catalogRevision
        self.onCatalogChange = onCatalogChange
        _viewModel = State(initialValue: DetalleBucketViewModel(
            api: api, bucket: bucket, periodo: periodo, onReclassified: onReclassified
        ))
    }

    var body: some View {
        ScrollView {
            // Lazy: a month can hold hundreds of movements, only the visible ones are built.
            LazyVStack(alignment: .leading, spacing: MirachSpacing.m) {
                content
            }
            .padding(.horizontal, MirachSpacing.l)
            .padding(.vertical, MirachSpacing.m)
        }
        // Pull to refresh repeats the query for the month on screen.
        .refreshable { await viewModel.refresh() }
        .background(Color.Mirach.Base.background.ignoresSafeArea(.all))
        .navigationTitle(viewModel.bucket.label)
        .navigationBarTitleDisplayMode(.inline)
        // The task restarts whenever the view reappears: that must neither drop the month nor
        // leave a load that was cancelled midway as an endless spinner.
        .task { await viewModel.loadIfNeeded() }
        .onChange(of: catalogRevision) { Task { await viewModel.catalogDidChange() } }
        // A group header opens its category (edit, delete, patterns).
        .navigationDestination(for: CategoriaRoute.self) { route in
            DetalleCategoriaView(
                api: api, categoriaId: route.id, onChange: onCatalogChange,
                onDeleted: { name in viewModel.categoryDeleted(named: name) }
            )
        }
        .sheet(isPresented: Binding(
            get: { viewModel.sheetMovement != nil },
            set: { if !$0 { viewModel.dismissSheet() } }
        )) {
            ReclasificarSheet(viewModel: viewModel)
                .interactiveDismissDisabled(viewModel.reclassifyingId != nil)
        }
        .onChange(of: viewModel.announcement) {
            if let text = viewModel.announcement { AccessibilityNotification.Announcement(text).post() }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading:
            VStack(spacing: MirachSpacing.m) {
                ProgressView()
                Text("Cargando movimientos…")
                    .mirachText(.cuerpo)
                    .foregroundStyle(Color.Mirach.Base.mutedForeground)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 48)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("detalle.loading")
        case .failed(let failure):
            VStack(spacing: MirachSpacing.m) {
                Text(failure == .connection
                    ? "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."
                    : "No pudimos cargar los movimientos. Inténtalo de nuevo en unos segundos.")
                    .mirachText(.cuerpo)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.Mirach.Feedback.errorText)
                Button("Reintentar") { Task { await viewModel.retry() } }
                    .prominentButton()
                    .accessibilityIdentifier("detalle.retry")
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 48)
            .accessibilityIdentifier("detalle.error")
        case .loaded(let detalle):
            MonthSelector(
                periodo: detalle.periodo,
                anterior: viewModel.anterior,
                siguiente: viewModel.siguiente,
                select: { periodo in Task { await viewModel.select(periodo) } },
                idPrefix: "detalle",
                titleFont: .mirach(.cuerpoDestacado)
            )
            notices
            if detalle.grupos.isEmpty {
                Text("Sin movimientos en \(Format.month(detalle.periodo))")
                    .mirachText(.cuerpoDestacado)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.Mirach.Base.foreground)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 32)
                    .accessibilityIdentifier("detalle.empty")
            } else {
                BucketHeader(detalle: detalle)
                ForEach(detalle.grupos) { group in
                    GroupHeader(group: group)
                    ForEach(group.transacciones) { movement in
                        MovementRow(
                            movement: movement,
                            isMoving: viewModel.reclassifyingId == movement.id,
                            isEnabled: viewModel.reclassifyingId == nil
                        ) { Task { await viewModel.beginReclassify(movement) } }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var notices: some View {
        if let text = viewModel.announcement {
            Label(text, systemImage: "checkmark.circle")
                .mirachText(.etiqueta)
                .foregroundStyle(Color.Mirach.Feedback.successText)
                // One element reading the sentence, not the icon's own description.
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(text)
                .accessibilityIdentifier("detalle.announcement")
        }
        if let text = viewModel.notice {
            Label(text, systemImage: "exclamationmark.triangle")
                .mirachText(.etiqueta)
                .foregroundStyle(Color.Mirach.Feedback.errorText)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(text)
                .accessibilityIdentifier("detalle.notice")
        }
    }
}

/// Figma 10: the total in Número grande, the counts under it and, when the API sends a target,
/// the real share against it on the bar. The bucket name is the navigation title.
private struct BucketHeader: View {
    let detalle: BucketDetalle

    var body: some View {
        VStack(alignment: .leading, spacing: MirachSpacing.s) {
            Text(Format.expense(detalle.total))
                .mirachText(.numeroGrande)
                .mirachFigures()
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .foregroundStyle(Color.Mirach.Feedback.expenseText)
            Text("\(DetalleBucketPresentation.movements(detalle.totalTransacciones)) · \(DetalleBucketPresentation.categories(detalle.totalCategorias))")
                .mirachText(.cuerpo)
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
            if let meta = detalle.metaBp {
                BucketTrack(
                    fill: detalle.bucket.fill,
                    fillFraction: BucketBarPresentation.fraction(bp: detalle.porcentajeBp ?? 0),
                    tickFraction: BucketBarPresentation.fraction(bp: meta)
                )
            }
            Text("\(Format.percent(bp: detalle.porcentajeBp)) del ingreso")
                .mirachText(.etiqueta)
                .mirachFigures()
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
            if let meta = detalle.metaBp {
                Text("Meta: \(Format.percent(bp: meta))")
                    .mirachText(.etiqueta)
                    .mirachFigures()
                    .foregroundStyle(Color.Mirach.Base.mutedForeground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(DetalleBucketPresentation.headerLabel(detalle))
        .accessibilityIdentifier("detalle.header")
    }
}

private struct GroupHeader: View {
    let group: GrupoCategoria
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        // «Sin categoría» has no category to open: its header is plain.
        if let id = group.categoriaId {
            NavigationLink(value: CategoriaRoute(id: id)) {
                HStack(spacing: MirachSpacing.s) {
                    header
                    Image(systemName: "chevron.right")
                        .mirachText(.etiqueta)
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.Mirach.Base.mutedForeground)
                        .accessibilityHidden(true)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.top, MirachSpacing.m)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(DetalleBucketPresentation.groupLabel(group))
            .accessibilityHint("Abrir la categoría")
            .accessibilityAddTraits(.isHeader)
            .accessibilityIdentifier("detalle.group.\(group.id)")
        } else {
            header
                .padding(.top, MirachSpacing.m)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(DetalleBucketPresentation.groupLabel(group))
                .accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("detalle.group.\(group.id)")
        }
    }

    private var header: some View {
        Group {
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: MirachSpacing.xs) {
                    name
                    figures
                }
            } else {
                HStack(alignment: .firstTextBaseline, spacing: MirachSpacing.s) {
                    name
                    Spacer(minLength: MirachSpacing.s)
                    figures
                }
            }
        }
    }

    private var name: some View {
        HStack(spacing: MirachSpacing.s) {
            Image(systemName: CategoryIcon.symbol(for: group.icono))
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
                .accessibilityHidden(true)
            Text(group.nombre)
                .mirachText(.cuerpoDestacado)
                // A category name is one word often: capped so it wraps by word, not by syllable.
                .dynamicTypeSize(...DynamicTypeSize.accessibility2)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .foregroundStyle(Color.Mirach.Base.foreground)
        }
    }

    private var figures: some View {
        HStack(spacing: MirachSpacing.s) {
            Text(DetalleBucketPresentation.movements(group.conteo))
                .mirachText(.etiqueta)
                .dynamicTypeSize(...DynamicTypeSize.accessibility2)
                // The count keeps its line; the name, which can shrink or wrap, gives way.
                .lineLimit(1)
                .fixedSize()
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
            Text(Format.expense(group.subtotal))
                .mirachText(.cuerpoDestacado)
                .mirachFigures()
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .foregroundStyle(Color.Mirach.Feedback.expenseText)
        }
    }
}

private struct MovementRow: View {
    let movement: MovimientoBucket
    let isMoving: Bool
    let isEnabled: Bool
    let onTap: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(spacing: 0) {
            Button(action: onTap) { content }
                .buttonStyle(.plain)
                .disabled(!isEnabled)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(DetalleBucketPresentation.rowLabel(movement))
                .accessibilityHint("Cambiar de categoría")
                .accessibilityIdentifier("detalle.row.\(movement.id)")
            Divider().overlay(Color.Mirach.Base.border)
        }
    }

    private var content: some View {
        Group {
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: MirachSpacing.xs) {
                    description
                    amount
                    subtitle
                }
            } else {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: MirachSpacing.m) {
                        description
                        Spacer(minLength: MirachSpacing.s)
                        amount
                    }
                    subtitle
                }
            }
        }
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .contentShape(Rectangle())
    }

    private var description: some View {
        Text(movement.descripcion)
            .mirachText(.cuerpo)
            // Large text: show the whole description instead of cutting it.
            .lineLimit(typeSize.isAccessibilitySize ? nil : 2)
            .foregroundStyle(Color.Mirach.Base.foreground)
    }

    private var amount: some View {
        Text(Format.expense(movement.monto))
            .mirachText(.cuerpoDestacado)
            .mirachFigures()
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .foregroundStyle(Color.Mirach.Feedback.expenseText)
    }

    /// Date and origin, then what the row does: the tag says it can be moved (VoiceOver gets a hint).
    private var subtitle: some View {
        HStack(spacing: MirachSpacing.s) {
            Text("\(Format.shortDate(movement.fecha)) · \(movement.origen)")
                // Wrap at word boundaries instead of truncating.
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            if isMoving {
                ProgressView()
            } else {
                Image(systemName: "tag").accessibilityHidden(true)
            }
        }
        .mirachText(.etiqueta)
        .foregroundStyle(Color.Mirach.Base.mutedForeground)
    }
}

/// «Guardar» under the categories (Figma 09), with «Aplicar a “…”» over it when the API suggested
/// a pattern for the picked category. Nothing moves until «Guardar».
private struct SaveFooter: View {
    @Bindable var viewModel: DetalleBucketViewModel

    var body: some View {
        VStack(spacing: MirachSpacing.m) {
            if let suggestion = viewModel.suggestion {
                CheckboxRow(
                    title: DetalleBucketPresentation.applyTitle(suggestion.parecidos.patron ?? ""),
                    lines: [
                        DetalleBucketPresentation.applySubtitle(suggestion.parecidos.total),
                        DetalleBucketPresentation.applyElsewhere(suggestion.parecidos.existente, categoriaId: suggestion.category.id),
                    ].compactMap { $0 },
                    spokenLabel: DetalleBucketPresentation.applyLabel(suggestion.parecidos, categoriaId: suggestion.category.id),
                    identifier: "detalle.applySimilar",
                    isOn: $viewModel.applyToSimilar
                )
            }
            Button("Guardar") { Task { await viewModel.save() } }
                .prominentButton()
            .disabled(!viewModel.canSave)
            .accessibilityHint(DetalleBucketPresentation.saveHint(viewModel.selection))
            .accessibilityIdentifier("detalle.saveCategory")
        }
    }
}

/// The sheet over the list: the user's categories, or what is happening with them.
private struct ReclasificarSheet: View {
    let viewModel: DetalleBucketViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Group {
            if let movement = viewModel.sheetMovement {
                switch viewModel.catalog {
                case .loaded(let catalog):
                    CategorySheet(
                        summaryTitle: movement.descripcion,
                        summaryDetail: "\(Format.shortDate(movement.fecha)) · \(Format.expense(movement.monto))",
                        catalog: catalog,
                        selectedID: viewModel.selection?.id ?? viewModel.currentCategoryId(of: movement),
                        idPrefix: "detalle",
                        notice: viewModel.sheetNotice,
                        isBusy: viewModel.reclassifyingId != nil || viewModel.isCheckingSimilar,
                        createdCount: viewModel.createdCategoryCount,
                        onSelect: { id in Task { await viewModel.choose(categoryId: id) } },
                        footer: AnyView(SaveFooter(viewModel: viewModel)),
                        createForm: {
                            NewCategoryForm(
                                initialPattern: nil,
                                errors: viewModel.categoryFormErrors,
                                isCreating: viewModel.isCreatingCategory,
                                onAppear: { viewModel.resetCategoryForm() },
                                onCreate: { new in Task { await viewModel.createCategory(new) } }
                            )
                        }
                    )
                case .idle, .loading:
                    waiting { ProgressView("Cargando categorías…").mirachText(.cuerpo).accessibilityIdentifier("detalle.catalogLoading") }
                case .failed:
                    waiting {
                        VStack(spacing: MirachSpacing.m) {
                            Text("No pudimos cargar las categorías.")
                                .mirachText(.cuerpo)
                                .foregroundStyle(Color.Mirach.Feedback.errorText)
                            Button("Reintentar") { Task { await viewModel.retryCatalog() } }
                                .prominentButton()
                                .accessibilityIdentifier("detalle.catalogRetry")
                        }
                        .accessibilityIdentifier("detalle.catalogError")
                    }
                }
            }
        }
        // Over the sheet, so it is above whatever the sheet is showing (list or form).
        .alert(
            "Cambiar de grupo",
            isPresented: Binding(get: { viewModel.pendingChange != nil }, set: { _ in }),
            presenting: viewModel.pendingChange
        ) { _ in
            Button("Cancelar", role: .cancel) { viewModel.cancelBucketChange() }
            Button("Confirmar") { Task { await viewModel.confirmBucketChange() } }
        } message: { change in
            Text(DetalleBucketPresentation.bucketChangeMessage(from: viewModel.bucket, to: change.category.bucket))
        }
    }

    private func waiting<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        NavigationStack {
            content()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.Mirach.Base.background.ignoresSafeArea(.all))
                .navigationTitle("Categoría")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancelar") { dismiss() }.accessibilityIdentifier("detalle.sheet.cancel")
                    }
                }
        }
        .presentationDetents([.large])
    }
}
