import SwiftUI

/// `revisando`: every row of the statement with its classification, grouped by bucket and
/// category. Tapping an editable row opens a sheet to choose another category.
struct ReviewView: View {
    let viewModel: SubirCartolaViewModel
    let preview: CartolaPreview
    let onDiscard: () -> Void

    @State private var editingRow: CartolaRow?
    @AccessibilityFocusState private var noticeFocused: Bool
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let catalog = viewModel.loadedCatalog
        let sections = ReviewPresentation.sections(rows: preview.filas, edits: viewModel.edits, catalog: catalog)
        ScrollView {
            // Lazy: a statement can have hundreds of rows, only the visible ones are built.
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                header
                    .padding(.bottom, 12)
                notices
                ForEach(sections) { section in
                    Section {
                        ForEach(section.rows) { row in
                            ReviewRow(
                                row: row,
                                classification: ReviewPresentation.classification(
                                    of: row, edit: viewModel.edits[row.rowIndex], catalog: catalog
                                ),
                                isEdited: viewModel.edits[row.rowIndex] != nil,
                                // No catalog (reloading or failed): nothing to choose from yet.
                                onEdit: row.esDuplicado || catalog == nil ? nil : { editingRow = row }
                            )
                            Divider().overlay(Color.Mirach.Base.border)
                        }
                    } header: {
                        SectionHeader(section: section)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 8)
        }
        .background(Color.Mirach.Base.background.ignoresSafeArea(.all))
        .safeAreaInset(edge: .bottom, spacing: 0) { actions }
        .sheet(item: $editingRow) { row in
            CategorySheet(
                row: row,
                catalog: catalog ?? CatalogoCategorias(categorias: []),
                selectedID: viewModel.edits[row.rowIndex] ?? row.sugerido?.categoriaId,
                onSelect: { id in
                    viewModel.choose(id, forRow: row.rowIndex)
                    editingRow = nil
                }
            )
        }
        // In the bar, not under "Confirmar": it frees room for rows and is hard to hit by accident.
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Descartar", role: .destructive, action: onDiscard)
                    .accessibilityIdentifier("review.discard")
            }
        }
        .onChange(of: viewModel.reviewNotice) { noticeFocused = viewModel.reviewNotice != nil }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(preview.banco) · \(preview.tipoCuenta)")
                .font(.headline)
                .foregroundStyle(Color.Mirach.Base.foreground)
            Text("Revisa las filas y confirma para importar. Nada se ha guardado aún.")
                .font(.subheadline)
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
        }
        // At accessibility sizes the rows are the content: keep the header from filling the
        // first screen (still large, and it scrolls away with the list).
        .dynamicTypeSize(...(typeSize.isAccessibilitySize ? .accessibility1 : .accessibility5))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("review.header")
    }

    @ViewBuilder
    private var notices: some View {
        if let notice = viewModel.reviewNotice {
            Text(notice)
                .foregroundStyle(Color.Mirach.Feedback.errorText)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, 12)
                .accessibilityFocused($noticeFocused)
                .accessibilityIdentifier("review.notice")
        }
        switch viewModel.catalog {
        case .loaded: EmptyView()
        case .loading:
            Label("Cargando categorías…", systemImage: "arrow.triangle.2.circlepath")
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
                .padding(.bottom, 12)
                .accessibilityIdentifier("review.catalogLoading")
        case .failed:
            VStack(alignment: .leading, spacing: 8) {
                Text("No pudimos cargar las categorías.")
                    .foregroundStyle(Color.Mirach.Feedback.errorText)
                Button("Reintentar") { Task { await viewModel.retryCatalog() } }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("review.catalogRetry")
            }
            .padding(.bottom, 12)
        }
    }

    private var actions: some View {
        VStack(spacing: 8) {
            Button { Task { await viewModel.confirm() } } label: {
                Text(confirmTitle).frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent).controlSize(.large)
            .disabled(viewModel.loadedCatalog == nil)
            .accessibilityIdentifier("review.confirm")
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        // The pinned bar must not eat the screen at accessibility sizes.
        .dynamicTypeSize(...(typeSize.isAccessibilitySize ? .accessibility1 : .accessibility5))
        // Opaque, so the rows scroll under it without showing through.
        .background(Color.Mirach.Base.background.ignoresSafeArea(.all))
        .overlay(alignment: .top) { Divider().overlay(Color.Mirach.Base.border) }
    }

    private var confirmTitle: String {
        switch viewModel.edits.count {
        case 0: "Confirmar"
        case 1: "Confirmar (1 cambio)"
        case let count: "Confirmar (\(count) cambios)"
        }
    }
}

/// «Necesidades · Supermercado» with the bucket swatch; pinned while its rows scroll.
private struct SectionHeader: View {
    let section: ReviewPresentation.Section
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        HStack(spacing: 8) {
            if let bucket = section.bucket {
                // The color is a fill; the name next to it is the real label.
                Rectangle().fill(bucket.fill).frame(width: 14, height: 14).accessibilityHidden(true)
            }
            Text(section.title)
                .font(.subheadline.bold())
                .foregroundStyle(Color.Mirach.Base.foreground)
            Spacer(minLength: 0)
            Text(String(section.rows.count))
                .font(.footnote)
                .mirachFigures()
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
        }
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        // Pinned while scrolling: capped at accessibility sizes so it does not eat the list.
        .dynamicTypeSize(...(typeSize.isAccessibilitySize ? .accessibility1 : .accessibility5))
        .background(Color.Mirach.Base.background)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
        .accessibilityIdentifier("review.section.\(section.id)")
    }
}

/// One statement row. Duplicates are not buttons: they say «Ya cargado» and do nothing.
private struct ReviewRow: View {
    let row: CartolaRow
    let classification: ReviewPresentation.Classification
    let isEdited: Bool
    /// `nil` when the row cannot be edited.
    let onEdit: (() -> Void)?
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        if let onEdit {
            Button(action: onEdit) { content }
                .buttonStyle(.plain)
                .accessibilityHint("Toca para cambiar la categoría")
                .accessibilityAddTraits(.isButton)
                .modifier(RowAccessibility(row: row, detail: detail, id: row.rowIndex))
        } else {
            content.modifier(RowAccessibility(row: row, detail: detail, id: row.rowIndex))
        }
    }

    private var content: some View {
        Group {
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 4) {
                    description
                    amount
                    subtitle
                }
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        description
                        Spacer(minLength: 8)
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
        Text(row.descripcion)
            .font(.body)
            .lineLimit(2)
            .foregroundStyle(row.esDuplicado ? Color.Mirach.Base.mutedForeground : Color.Mirach.Base.foreground)
    }

    private var amount: some View {
        Text(row.amountText)
            .font(.body)
            .mirachFigures()
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .foregroundStyle(row.cargo != 0 ? Color.Mirach.Feedback.expenseText : Color.Mirach.Base.foreground)
    }

    /// Date, classification and marks. One line normally; stacked at accessibility sizes so
    /// nothing is squeezed into a narrow column and hyphenated mid-word.
    @ViewBuilder
    private var subtitle: some View {
        if typeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 2) {
                Text(Format.shortDate(row.fecha))
                subtitleDetail
            }
            // Wrap at word boundaries instead of truncating.
            .fixedSize(horizontal: false, vertical: true)
            .font(.footnote)
            .foregroundStyle(Color.Mirach.Base.mutedForeground)
        } else {
            HStack(spacing: 6) {
                Text(Format.shortDate(row.fecha))
                Text("·")
                subtitleDetail
                if !row.esDuplicado {
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.footnote).accessibilityHidden(true)
                }
            }
            .font(.footnote)
            .foregroundStyle(Color.Mirach.Base.mutedForeground)
        }
    }

    @ViewBuilder
    private var subtitleDetail: some View {
        if row.esDuplicado {
            Label("Ya cargado", systemImage: "checkmark.circle")
        } else {
            Text(classification.text)
            if isEdited { Label("Editada", systemImage: "pencil").labelStyle(.titleAndIcon) }
        }
    }

    private var detail: String {
        if row.esDuplicado { return "Ya cargado, no se puede editar" }
        return classification.text + (isEdited ? ", editada" : "")
    }
}

/// One VoiceOver element per row: description, amount, date and classification.
private struct RowAccessibility: ViewModifier {
    let row: CartolaRow
    let detail: String
    let id: Int

    func body(content: Content) -> some View {
        content
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(row.descripcion). \(row.spokenAmount). \(Format.shortDate(row.fecha)). \(detail)")
            .accessibilityIdentifier("review.row.\(id)")
    }
}

/// The modal sheet: every category of the catalog, grouped by bucket.
struct CategorySheet: View {
    let row: CartolaRow
    let catalog: CatalogoCategorias
    let selectedID: String?
    let onSelect: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                ForEach(catalog.groups, id: \.bucket) { group in
                    Section {
                        if group.categorias.isEmpty {
                            Text("Sin categorías").foregroundStyle(Color.Mirach.Base.mutedForeground)
                        }
                        ForEach(group.categorias) { category in
                            Button { onSelect(category.id) } label: {
                                HStack {
                                    Text(category.nombre).foregroundStyle(Color.Mirach.Base.foreground)
                                    Spacer()
                                    if category.id == selectedID {
                                        Image(systemName: "checkmark").accessibilityHidden(true)
                                    }
                                }
                                .frame(minHeight: 44)
                                .contentShape(Rectangle())
                            }
                            .accessibilityAddTraits(category.id == selectedID ? .isSelected : [])
                            .accessibilityIdentifier("review.category.\(category.id)")
                        }
                    } header: {
                        HStack(spacing: 8) {
                            Rectangle().fill(group.bucket.fill).frame(width: 14, height: 14).accessibilityHidden(true)
                            Text(group.bucket.label)
                        }
                        .font(.subheadline.bold())
                        .foregroundStyle(Color.Mirach.Base.foreground)
                        .textCase(nil)
                        .accessibilityElement(children: .combine)
                        .accessibilityAddTraits(.isHeader)
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Color.Mirach.Base.background.ignoresSafeArea(.all))
            .safeAreaInset(edge: .top, spacing: 0) { rowSummary }
            .navigationTitle("Categoría")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }.accessibilityIdentifier("review.sheet.cancel")
                }
            }
        }
        .presentationDetents([.medium, .large])
        .accessibilityIdentifier("review.sheet")
    }

    /// What is being classified, so the sheet makes sense without the list behind it.
    private var rowSummary: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(row.descripcion).font(.headline).lineLimit(2)
            Text("\(Format.shortDate(row.fecha)) · \(row.amountText)")
                .font(.footnote)
                .mirachFigures()
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
        }
        .foregroundStyle(Color.Mirach.Base.foreground)
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.Mirach.Base.card)
        .overlay(alignment: .bottom) { Divider().overlay(Color.Mirach.Base.border) }
        .accessibilityElement(children: .combine)
    }
}
