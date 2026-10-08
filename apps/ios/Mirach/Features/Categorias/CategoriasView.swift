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
                .toolbar {
                    ToolbarItem(placement: .primaryAction) {
                        Button { openForm() } label: { Label("Nueva categoría", systemImage: "plus") }
                            .disabled(!isLoaded)
                            .accessibilityIdentifier("categorias.new")
                    }
                }
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
                Text("Cargando categorías…").foregroundStyle(Color.Mirach.Base.mutedForeground)
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
            if catalog.categorias.isEmpty { empty }
            ForEach(catalog.groups, id: \.bucket) { group in
                Section {
                    if group.categorias.isEmpty {
                        Text("Sin categorías")
                            .foregroundStyle(Color.Mirach.Base.mutedForeground)
                            .accessibilityIdentifier("categorias.empty.\(group.bucket.apiName)")
                            .listRowBackground(Color.Mirach.Base.background)
                    }
                    ForEach(group.categorias) { category in
                        NavigationLink(value: CategoriaRoute(id: category.id)) { CategoriaRow(category: category) }
                            .listRowBackground(Color.Mirach.Base.background)
                            .listRowSeparatorTint(Color.Mirach.Base.border)
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

    @ViewBuilder
    private var notices: some View {
        if let text = viewModel.announcement {
            Label(text, systemImage: "checkmark.circle")
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
        listRowBackground(Color.clear).listRowSeparator(.hidden)
    }
}

private struct BucketHeader: View {
    let bucket: Bucket

    var body: some View {
        HStack(spacing: 8) {
            // The bucket color is a fill, the name next to it is the real label.
            Rectangle().fill(bucket.fill).frame(width: 14, height: 14).accessibilityHidden(true)
            Text(bucket.label)
        }
        .font(.subheadline.bold())
        .foregroundStyle(Color.Mirach.Base.foreground)
        .textCase(nil)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
        .accessibilityIdentifier("categorias.group.\(bucket.apiName)")
    }
}

private struct CategoriaRow: View {
    let category: CategoriaCatalogo
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: CategoryIcon.symbol(for: category.icono))
                // Fixed size: at the largest text sizes a scaled symbol would spill over the name.
                .font(.system(size: 20))
                .frame(width: 28)
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(category.nombre)
                    .font(.headline)
                    // A category name is one word often: capped so it wraps by word, not by syllable.
                    .dynamicTypeSize(...DynamicTypeSize.accessibility2)
                    .lineLimit(2)
                    .foregroundStyle(Color.Mirach.Base.foreground)
                Text(CategoriasPresentation.counts(category))
                    .font(.footnote)
                    .dynamicTypeSize(...DynamicTypeSize.accessibility2)
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(Color.Mirach.Base.mutedForeground)
            }
        }
        .frame(minHeight: 44)
        .padding(.vertical, 4)
    }
}
