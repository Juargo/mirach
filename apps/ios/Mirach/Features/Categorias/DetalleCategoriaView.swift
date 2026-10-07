import SwiftUI

/// "Detalle de categoría y patrones": edit a category in place (name, bucket, icon), delete it,
/// and manage its patterns. It never decides which pattern wins: the API classifies.
struct DetalleCategoriaView: View {
    @State private var viewModel: DetalleCategoriaViewModel
    @Environment(\.dismiss) private var dismiss
    /// VoiceOver jumps to the result of a write when it appears.
    @AccessibilityFocusState private var messageFocused: Bool

    init(
        api: any MirachAPI, categoriaId: String,
        onChange: @escaping @MainActor () -> Void, onDeleted: @escaping @MainActor (String) -> Void = { _ in }
    ) {
        _viewModel = State(initialValue: DetalleCategoriaViewModel(
            api: api, categoriaId: categoriaId, onChange: onChange, onDeleted: onDeleted
        ))
    }

    var body: some View {
        content
            .background(Color.Mirach.Base.background.ignoresSafeArea(.all))
            .navigationTitle(viewModel.category?.nombre ?? "Categoría")
            .navigationBarTitleDisplayMode(.inline)
            // With unsaved changes the system back button would drop them silently: ours asks first.
            .navigationBarBackButtonHidden(viewModel.hasChanges)
            .toolbar { toolbar }
            // The task restarts whenever the view reappears: that must neither blank the screen
            // nor leave a load that was cancelled midway as an endless spinner.
            .task { await viewModel.loadIfNeeded() }
            .onChange(of: viewModel.isGone) { if viewModel.isGone { dismiss() } }
            .onChange(of: viewModel.announcement) {
                guard let text = viewModel.announcement else { return }
                messageFocused = true
                AccessibilityNotification.Announcement(text).post()
            }
            .sheet(isPresented: Binding(
                get: { viewModel.patternSheet != nil },
                set: { if !$0 { viewModel.dismissPatternSheet() } }
            )) {
                PatternSheet(viewModel: viewModel).interactiveDismissDisabled(viewModel.isSavingPattern)
            }
            .alert(
                "Cambiar de grupo",
                isPresented: Binding(get: { viewModel.pendingBucketChange != nil }, set: { _ in }),
                presenting: viewModel.pendingBucketChange
            ) { _ in
                Button("Cancelar", role: .cancel) { viewModel.cancelBucketChange() }
                Button("Confirmar") { Task { await viewModel.confirmBucketChange() } }
            } message: { change in
                Text(DetalleCategoriaPresentation.bucketChange(change))
            }
            .alert(
                "¿Eliminar categoría?",
                isPresented: Binding(get: { viewModel.pendingDeletion }, set: { _ in }),
                presenting: viewModel.category
            ) { _ in
                Button("Eliminar", role: .destructive) { Task { await viewModel.confirmDeletion() } }
                Button("Cancelar", role: .cancel) { viewModel.cancelDeletion() }
            } message: { category in
                Text(DetalleCategoriaPresentation.deletion(category))
            }
            .alert(
                "¿Eliminar este patrón?",
                isPresented: Binding(get: { viewModel.pendingPatternDeletion != nil }, set: { _ in }),
                presenting: viewModel.pendingPatternDeletion
            ) { _ in
                Button("Eliminar", role: .destructive) { Task { await viewModel.confirmPatternDeletion() } }
                Button("Cancelar", role: .cancel) { viewModel.cancelPatternDeletion() }
            } message: { _ in
                Text("Los movimientos ya clasificados no cambian.")
            }
            .alert(
                "¿Descartar los cambios?",
                isPresented: Binding(get: { viewModel.pendingDiscard }, set: { _ in })
            ) {
                Button("Descartar", role: .destructive) {
                    viewModel.discardChanges()
                    dismiss()
                }
                Button("Seguir editando", role: .cancel) { viewModel.cancelDiscard() }
            } message: {
                Text("Los cambios que no guardaste se perderán.")
            }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        if viewModel.hasChanges {
            ToolbarItem(placement: .cancellationAction) {
                Button { viewModel.askToDiscard() } label: { Label("Categorías", systemImage: "chevron.backward") }
                    .accessibilityIdentifier("categoria.back")
            }
        }
        ToolbarItem(placement: .confirmationAction) {
            if viewModel.isSaving {
                ProgressView().accessibilityLabel("Guardando…")
            } else {
                Button("Guardar") { Task { await viewModel.save() } }
                    .disabled(!viewModel.hasChanges || viewModel.isProtected)
                    .accessibilityIdentifier("categoria.save")
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading:
            centered {
                ProgressView()
                Text("Cargando…").foregroundStyle(Color.Mirach.Base.mutedForeground)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("categoria.loading")
        case .failed(let failure):
            centered {
                Text(failure == .connection
                    ? "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."
                    : "No pudimos cargar la categoría. Inténtalo de nuevo en unos segundos.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.Mirach.Feedback.errorText)
                Button("Reintentar") { Task { await viewModel.retry() } }
                    .prominentButton()
                    .accessibilityIdentifier("categoria.retry")
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("categoria.error")
        case .notFound:
            centered {
                Text(DetalleCategoriaPresentation.goneMessage)
                    .font(.headline)
                    .foregroundStyle(Color.Mirach.Base.foreground)
                Button("Volver a Categorías") { dismiss() }
                    .prominentButton()
                    .accessibilityIdentifier("categoria.back.gone")
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("categoria.gone")
        case .loaded(let category):
            form(category)
        }
    }

    private func centered<Inner: View>(@ViewBuilder _ inner: () -> Inner) -> some View {
        VStack(spacing: 12) { inner() }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .padding(.top, 48)
            .padding(.horizontal, 16)
    }

    // MARK: form

    private func form(_ category: CategoriaCatalogo) -> some View {
        // A protected category cannot be edited. Only the controls go off: a disabled form would
        // not scroll either, and the person still has to be able to read it.
        let locked = viewModel.isProtected || viewModel.isSaving
        return VStack(spacing: 0) {
            banner
            formBody(category, locked: locked)
        }
    }

    private func formBody(_ category: CategoriaCatalogo, locked: Bool) -> some View {
        Form {
            messages
            Section {
                TextField("Nombre", text: $viewModel.draftNombre)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .accessibilityIdentifier("categoria.name")
                fieldError(viewModel.fieldErrors.name, id: "categoria.error.name")
            } header: { Text("Nombre") } footer: {
                Text(DetalleBucketPresentation.movements(category.transaccionesCount) + " en total")
            }
            .listRowBackground(Color.Mirach.Base.card)
            .disabled(locked)

            Section {
                BucketChoice(
                    selection: Binding(get: { viewModel.draftBucket }, set: { if let bucket = $0 { viewModel.draftBucket = bucket } }),
                    idPrefix: "categoria"
                )
                fieldError(viewModel.fieldErrors.bucket, id: "categoria.error.bucket")
            } header: { Text("Grupo") } footer: {
                Text("Define cómo cuenta este gasto en tu 50/30/20; afecta todos los meses.")
            }
            .listRowBackground(Color.Mirach.Base.card)
            .disabled(locked)

            Section {
                IconPicker(selection: viewModel.draftIcono, allowsNone: category.icono == nil, idPrefix: "categoria") {
                    viewModel.draftIcono = $0
                }
                fieldError(viewModel.fieldErrors.icon, id: "categoria.error.icon")
            } header: { Text("Ícono") }
                .listRowBackground(Color.Mirach.Base.card)
                .disabled(locked)

            patternsSection(category).disabled(locked)

            if let general = viewModel.fieldErrors.general {
                Section {
                    Text(general)
                        .foregroundStyle(Color.Mirach.Feedback.errorText)
                        .accessibilityIdentifier("categoria.error.general")
                }
                .listRowBackground(Color.Mirach.Base.card)
            }

            Section {
                if viewModel.isDeleting {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Eliminando…").foregroundStyle(Color.Mirach.Base.mutedForeground)
                    }
                    .accessibilityElement(children: .combine)
                } else {
                    Button(role: .destructive) { viewModel.requestDeletion() } label: {
                        Label("Eliminar categoría", systemImage: "trash")
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                    .foregroundStyle(Color.Mirach.Feedback.errorText)
                    .accessibilityIdentifier("categoria.delete")
                }
            }
            .listRowBackground(Color.Mirach.Base.card)
            .disabled(locked)
        }
        .scrollContentBackground(.hidden)
        .refreshable { await viewModel.refresh() }
    }

    /// The system category notice stays with the form; it never changes.
    @ViewBuilder
    private var messages: some View {
        if viewModel.isProtected {
            Label(viewModel.protectedMessage, systemImage: "lock")
                .foregroundStyle(Color.Mirach.Base.foreground)
                .accessibilityIdentifier("categoria.protected")
                .listRowBackground(Color.Mirach.Base.card)
        }
    }

    /// The result of a write, pinned above the form: the person may be scrolled to the bottom
    /// (the delete button, the patterns) and must still see it.
    @ViewBuilder
    private var banner: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let text = viewModel.announcement {
                Label(text, systemImage: "checkmark.circle")
                    .foregroundStyle(Color.Mirach.Feedback.successText)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(text)
                    .accessibilityFocused($messageFocused)
                    .accessibilityIdentifier("categoria.announcement")
            }
            if let text = viewModel.notice ?? viewModel.refreshNotice {
                Label(text, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(Color.Mirach.Feedback.errorText)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(text)
                    .accessibilityIdentifier("categoria.notice")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, viewModel.announcement != nil || viewModel.notice != nil || viewModel.refreshNotice != nil ? 12 : 0)
        .background(Color.Mirach.Base.card)
    }

    private func patternsSection(_ category: CategoriaCatalogo) -> some View {
        Section {
            if category.patrones.isEmpty {
                Text("Sin patrones: esta categoría solo se puede asignar manualmente.")
                    .foregroundStyle(Color.Mirach.Base.mutedForeground)
                    .accessibilityIdentifier("categoria.patterns.empty")
            }
            ForEach(category.patrones) { pattern in
                PatternRow(
                    pattern: pattern,
                    isDeleting: viewModel.deletingPattern == pattern.id,
                    edit: { viewModel.beginEditPattern(pattern) },
                    delete: { viewModel.requestPatternDeletion(pattern) }
                )
            }
            Button { viewModel.beginAddPattern() } label: {
                Label("Agregar patrón", systemImage: "plus")
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }
            .accessibilityIdentifier("categoria.pattern.add")
        } header: { Text("Patrones") } footer: {
            Text("Se aplican a las próximas importaciones. Los movimientos ya importados no cambian.")
        }
        .listRowBackground(Color.Mirach.Base.card)
    }

    @ViewBuilder
    private func fieldError(_ text: String?, id: String) -> some View {
        if let text {
            Text(text)
                .font(.footnote)
                .foregroundStyle(Color.Mirach.Feedback.errorText)
                .accessibilityIdentifier(id)
        }
    }
}

private struct PatternRow: View {
    let pattern: PatronCategoria
    let isDeleting: Bool
    let edit: () -> Void
    let delete: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4)) : AnyLayout(HStackLayout(spacing: 8))
        layout {
            Button(action: edit) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(pattern.patron)
                        .font(.body.monospaced())
                        .foregroundStyle(Color.Mirach.Base.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(pattern.matchType.label)
                        .font(.footnote)
                        .foregroundStyle(Color.Mirach.Base.mutedForeground)
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(pattern.matchType.label): \(pattern.patron)")
            .accessibilityHint("Editar el patrón")
            .accessibilityIdentifier("categoria.pattern.\(pattern.id)")

            if isDeleting {
                ProgressView().frame(minWidth: 44, minHeight: 44)
            } else {
                // VoiceOver does not use the swipe: the same action is a button in the row.
                Button(role: .destructive, action: delete) {
                    Image(systemName: "trash").frame(minWidth: 44, minHeight: 44)
                }
                .buttonStyle(.borderless)
                .foregroundStyle(Color.Mirach.Feedback.errorText)
                .accessibilityLabel("Eliminar el patrón \(pattern.patron)")
                .accessibilityIdentifier("categoria.pattern.delete.\(pattern.id)")
            }
        }
    }
}

/// The sheet for a new pattern or the edit of one: text and match type, with the server's
/// verdict (invalid expression, duplicate) under the field.
private struct PatternSheet: View {
    let viewModel: DetalleCategoriaViewModel
    @State private var text = ""
    @State private var matchType: MatchType = .contains
    @State private var seeded = false

    private var isEditing: Bool {
        if case .editing = viewModel.patternSheet { true } else { false }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Texto a buscar", text: $text)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .accessibilityIdentifier("pattern.text")
                    if let error = viewModel.patternErrors.pattern {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(Color.Mirach.Feedback.errorText)
                            .accessibilityIdentifier("pattern.error.text")
                    }
                } header: { Text("Patrón") } footer: {
                    Text("Compara con la descripción del movimiento. Distingue tildes, no mayúsculas.")
                }
                .listRowBackground(Color.Mirach.Base.card)

                Section {
                    ForEach(MatchType.options(including: viewModel.patternSheetMatchType), id: \.apiName) { option in
                        Button { matchType = option } label: {
                            HStack {
                                Text(option.label).foregroundStyle(Color.Mirach.Base.foreground)
                                Spacer()
                                if matchType == option { Image(systemName: "checkmark").accessibilityHidden(true) }
                            }
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(matchType == option ? .isSelected : [])
                        .accessibilityIdentifier("pattern.type.\(option.apiName)")
                    }
                } header: { Text("Tipo de coincidencia") }
                    .listRowBackground(Color.Mirach.Base.card)

                if let general = viewModel.patternErrors.general {
                    Section {
                        Text(general)
                            .foregroundStyle(Color.Mirach.Feedback.errorText)
                            .accessibilityIdentifier("pattern.error.general")
                    }
                    .listRowBackground(Color.Mirach.Base.card)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.Mirach.Base.background.ignoresSafeArea(.all))
            .navigationTitle(isEditing ? "Editar patrón" : "Nuevo patrón")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { viewModel.dismissPatternSheet() }
                        .disabled(viewModel.isSavingPattern)
                        .accessibilityIdentifier("pattern.cancel")
                }
                ToolbarItem(placement: .confirmationAction) {
                    if viewModel.isSavingPattern {
                        ProgressView().accessibilityLabel("Guardando…")
                    } else {
                        Button("Guardar") { Task { await viewModel.savePattern(text: text, matchType: matchType) } }
                            .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty)
                            .accessibilityIdentifier("pattern.save")
                    }
                }
            }
            .onAppear {
                // Once: the sheet may re-appear while a field error is up.
                guard !seeded else { return }
                seeded = true
                if case .editing(let pattern) = viewModel.patternSheet {
                    text = pattern.patron
                    matchType = viewModel.patternSheetMatchType
                }
            }
        }
        .accessibilityIdentifier("pattern.sheet")
    }
}
