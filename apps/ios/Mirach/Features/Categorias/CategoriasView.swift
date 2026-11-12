import SwiftUI

/// Where "Detalle de categoría" is pushed from (the Categorías list and a bucket detail's
/// group headers). The category is identified by its id, never by name (ADR-042).
struct CategoriaRoute: Hashable {
    let id: String
}

/// "Categorías": the catalog grouped by bucket, with creation in a sheet.
struct CategoriasView: View {
    @State private var viewModel: CategoriasViewModel
    @State private var showingForm = false
    /// VoiceOver jumps to the result of a creation when it appears.
    @AccessibilityFocusState private var announcementFocused: Bool
    /// The announcement is the list's first row: when it appears with the list scrolled down (or
    /// while a category's detail covers the list), the list scrolls back to it once visible, so the
    /// result of a write is always seen and stays in the accessibility tree.
    @State private var scrollToAnnouncement = false
    @State private var listVisible = false
    private static let announcementRow = "categorias.announcement.row"
    private let api: any MirachAPI
    /// Changes whenever the catalog was written anywhere: the list is read again.
    private let catalogRevision: Int
    private let onChange: @MainActor () -> Void

    init(api: any MirachAPI, catalogRevision: Int, onChange: @escaping @MainActor () -> Void) {
        self.api = api
        self.catalogRevision = catalogRevision
        self.onChange = onChange
        _viewModel = State(initialValue: CategoriasViewModel(api: api, onChange: onChange))
    }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
            List { content }
                .listStyle(.plain)
                .onAppear {
                    listVisible = true
                    if scrollToAnnouncement { showAnnouncement(proxy) }
                }
                .onDisappear { listVisible = false }
                .onChange(of: scrollToAnnouncement) {
                    if scrollToAnnouncement, listVisible { showAnnouncement(proxy) }
                }
                // The list paints its own backdrop otherwise: the page colour must reach every edge.
                .scrollContentBackground(.hidden)
                .background(Color.Mirach.Base.background.ignoresSafeArea(.all))
                .refreshable { await viewModel.refresh() }
                .navigationTitle("Categorías")
                .navigationBarTitleDisplayMode(.inline)
                // The task restarts whenever the view reappears: that must neither blank the list nor
                // leave a load that was cancelled midway as an endless spinner.
                .task { await viewModel.loadIfNeeded() }
                .onChange(of: catalogRevision) { Task { await viewModel.catalogDidChange() } }
                .onChange(of: viewModel.createdCount) { showingForm = false }
                .onChange(of: viewModel.announcement) {
                    guard let text = viewModel.announcement else { return }
                    scrollToAnnouncement = true
                    announcementFocused = true
                    AccessibilityNotification.Announcement(text).post()
                }
                .sheet(isPresented: $showingForm) { form }
                .navigationDestination(for: CategoriaRoute.self) { route in
                    DetalleCategoriaView(
                        api: api, categoriaId: route.id, onChange: onChange,
                        onDeleted: { name in viewModel.announceDeletion(of: name) }
                    )
                }
            }
        }
    }

    private func showAnnouncement(_ proxy: ScrollViewProxy) {
        scrollToAnnouncement = false
        withAnimation { proxy.scrollTo(Self.announcementRow, anchor: .top) }
    }

    private var isLoaded: Bool {
        if case .loaded = viewModel.state { true } else { false }
    }

    private func openForm() {
        viewModel.resetForm()
        showingForm = true
    }

    private var form: some View {
        NavigationStack {
            NewCategoryForm(
                initialPattern: nil,
                errors: viewModel.formErrors,
                isCreating: viewModel.isCreating,
                onAppear: { viewModel.resetForm() },
                onCreate: { new in Task { await viewModel.create(new) } },
                offersIcon: true
            )
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { showingForm = false }
                        .disabled(viewModel.isCreating)
                        .accessibilityIdentifier("categorias.form.cancel")
                }
            }
        }
        .interactiveDismissDisabled(viewModel.isCreating)
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading:
            VStack(spacing: 12) {
                ProgressView()
                Text("Cargando categorías…").mirachText(.cuerpo).foregroundStyle(Color.Mirach.Base.mutedForeground)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 48)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("categorias.loading")
            .plainRow()
        case .failed(let failure):
            VStack(spacing: 12) {
                Text(failure == .connection
                    ? "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."
                    : "No pudimos cargar las categorías. Inténtalo de nuevo en unos segundos.")
                    .mirachText(.cuerpo)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.Mirach.Feedback.errorText)
                Button("Reintentar") { Task { await viewModel.retry() } }
                    .prominentButton()
                    .accessibilityIdentifier("categorias.retry")
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 48)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("categorias.error")
            .plainRow()
        case .loaded(let catalog):
            notices
            newCategoryRow
            if catalog.categorias.isEmpty { empty }
            ForEach(catalog.groups, id: \.bucket) { group in
                Section {
                    if group.categorias.isEmpty {
                        Text("Sin categorías")
                            .mirachText(.etiqueta)
                            .foregroundStyle(Color.Mirach.Base.mutedForeground)
                            .accessibilityIdentifier("categorias.empty.\(group.bucket.apiName)")
                            .listRowBackground(Color.Mirach.Base.background)
                            .listRowInsets(Self.rowInsets)
                    }
                    ForEach(group.categorias) { category in
                        NavigationLink(value: CategoriaRoute(id: category.id)) { CategoriaRow(category: category) }
                            .listRowBackground(Color.Mirach.Base.background)
                            .listRowSeparatorTint(Color.Mirach.Base.border)
                            .listRowInsets(Self.rowInsets)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel(CategoriasPresentation.rowLabel(category))
                            .accessibilityIdentifier("categorias.row.\(category.id)")
                    }
                } header: {
                    BucketHeader(bucket: group.bucket)
                }
            }
        }
    }

    /// Figma 26: the screen's side margin is the `l` step; rows are flat and ruled.
    private static let rowInsets = EdgeInsets(top: 0, leading: MirachSpacing.l, bottom: 0, trailing: MirachSpacing.l)

    /// The first row of the list: «+ Nueva categoría» with a chevron. VoiceOver keeps the old name.
    private var newCategoryRow: some View {
        Button { openForm() } label: {
            HStack(spacing: MirachSpacing.s) {
                Text("+ Nueva categoría")
                    .mirachText(.cuerpo)
                    .foregroundStyle(Color.Mirach.Base.foreground)
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color.Mirach.Base.mutedForeground)
                    .accessibilityHidden(true)
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!isLoaded)
        .accessibilityLabel("Nueva categoría")
        .accessibilityIdentifier("categorias.new")
        .listRowBackground(Color.Mirach.Base.background)
        .listRowSeparatorTint(Color.Mirach.Base.border)
        .listRowInsets(Self.rowInsets)
    }

    @ViewBuilder
    private var notices: some View {
        if let text = viewModel.announcement {
            Label(text, systemImage: "checkmark.circle")
                .mirachText(.etiqueta)
                .foregroundStyle(Color.Mirach.Feedback.successText)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(text)
                .accessibilityFocused($announcementFocused)
                .accessibilityIdentifier("categorias.announcement")
                .plainRow()
                .id(Self.announcementRow)
        }
        if let text = viewModel.refreshNotice {
            Label(text, systemImage: "exclamationmark.triangle")
                .mirachText(.etiqueta)
                .foregroundStyle(Color.Mirach.Feedback.errorText)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(text)
                .accessibilityIdentifier("categorias.notice")
                .plainRow()
        }
    }

    private var empty: some View {
        VStack(spacing: 16) {
            Text("Todavía no tienes categorías. Crea tu primera categoría para empezar a clasificar tus movimientos.")
                .mirachText(.cuerpo)
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
            Button("Nueva categoría") { openForm() }
                .prominentButton()
                .accessibilityIdentifier("categorias.emptyNew")
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("categorias.empty")
        .plainRow()
    }
}

private extension View {
    /// A row that is not a list item: no separator, no backdrop of its own.
    func plainRow() -> some View {
        listRowBackground(Color.clear).listRowSeparator(.hidden).listRowInsets(
            EdgeInsets(top: 0, leading: MirachSpacing.l, bottom: 0, trailing: MirachSpacing.l)
        )
    }
}

private struct BucketHeader: View {
    let bucket: Bucket

    var body: some View {
        // Mini, uppercase, muted (Figma 26); VoiceOver still reads the bucket's name.
        SectionLabel(bucket.label)
            // The plain list already insets a header by 16pt; the rest reaches the 24pt margin.
            .padding(.horizontal, MirachSpacing.s)
            .padding(.top, MirachSpacing.m)
            .padding(.bottom, MirachSpacing.xs)
            .frame(maxWidth: .infinity, alignment: .leading)
            .textCase(nil)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(bucket.label)
            .accessibilityAddTraits(.isHeader)
            .accessibilityIdentifier("categorias.group.\(bucket.apiName)")
    }
}

private struct CategoriaRow: View {
    let category: CategoriaCatalogo
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        HStack(alignment: .top, spacing: MirachSpacing.m - 4) {
            Image(systemName: CategoryIcon.symbol(for: category.icono))
                // Fixed size: at the largest text sizes a scaled symbol would spill over the name.
                .font(.system(size: 20))
                .frame(width: 28)
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: MirachSpacing.xs) {
                Text(category.nombre)
                    .mirachText(.cuerpo)
                    // A category name is one word often: capped so it wraps by word, not by syllable.
                    .dynamicTypeSize(...DynamicTypeSize.accessibility2)
                    .lineLimit(2)
                    .foregroundStyle(Color.Mirach.Base.foreground)
                Text(CategoriasPresentation.counts(category))
                    .mirachText(.etiqueta)
                    .dynamicTypeSize(...DynamicTypeSize.accessibility2)
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(Color.Mirach.Base.mutedForeground)
            }
        }
        .frame(minHeight: 44)
        .padding(.vertical, 4)
    }
}
