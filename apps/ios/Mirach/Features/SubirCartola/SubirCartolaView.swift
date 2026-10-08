import SwiftUI
import UniformTypeIdentifiers

/// "Subir cartola": one screen that changes with the view model's `state`.
struct SubirCartolaView: View {
    let viewModel: SubirCartolaViewModel
    /// For "Cartolas subidas", which this screen opens.
    let api: any MirachAPI
    /// An import was deleted there: the Resumen must reload.
    var onCartolaDeleted: @MainActor () -> Void = {}
    /// "Ver resumen del mes": the shell switches to the Resumen tab.
    let onShowSummary: () -> Void
    /// UI tests only: a file the hook button picks instead of the system picker, which
    /// XCUITest cannot drive reliably. Always `nil` in a normal launch.
    var testFixtureURL: URL?

    @State private var isPickingFile = false
    @State private var confirmingDiscard = false
    @Environment(\.dynamicTypeSize) private var typeSize
    /// VoiceOver jumps to the status message when it appears or changes.
    @AccessibilityFocusState private var messageFocused: Bool

    var body: some View {
        NavigationStack {
            Group {
                if case .revisando(let preview) = viewModel.state {
                    // Its own scrolling container: the rows must be lazy.
                    ReviewView(viewModel: viewModel, preview: preview, onDiscard: { confirmingDiscard = true })
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            content
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                    }
                    // The colour must reach every edge, including the area the keyboard covers
                    // (the password step), so it ignores all safe areas instead of hugging the content.
                    .background(Color.Mirach.Base.background.ignoresSafeArea(.all))
                }
            }
            .navigationTitle("Subir cartola")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: CartolasSubidasRoute.self) { _ in
                CartolasSubidasView(api: api, onChange: onCartolaDeleted)
            }
            // The system document picker, limited to the two formats the API reads. The URL it
            // returns is only readable inside a "security-scoped" window; staging handles that.
            .fileImporter(isPresented: $isPickingFile, allowedContentTypes: Self.allowedTypes) { result in
                guard case .success(let url) = result else { return }
                Task { await viewModel.chooseFile(url) }
            }
            // An alert gives the two explicit options (on iPhone a confirmation dialog can show as a
            // popover with no visible cancel button).
            .alert("¿Descartar esta cartola?", isPresented: $confirmingDiscard) {
                Button("Descartar", role: .destructive) { viewModel.discard() }
                Button("Seguir con la cartola", role: .cancel) {}
            } message: {
                Text("Se perderá la revisión. Nada se ha guardado.")
            }
            .onChange(of: viewModel.state) { messageFocused = hasMessage }
        }
    }

    private static let allowedTypes: [UTType] = [.pdf, UTType(filenameExtension: "xlsx")].compactMap { $0 }

    // MARK: states

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .inicial(let message):
            if let message { StatusMessage(text: message, isError: true).accessibilityFocused($messageFocused) }
            initial
        case .previsualizando:
            Progress(text: "Generando vista previa…", identifier: "subir.previewing")
        case .protegido(let filename, let incorrect):
            PasswordPrompt(
                filename: filename, incorrect: incorrect,
                submit: { password in Task { await viewModel.submitPassword(password) } },
                chooseOther: { isPickingFile = true },
                messageFocus: $messageFocused
            )
        case .errorPrevia(let failure):
            StatusMessage(text: failure.message, isError: true)
                .accessibilityFocused($messageFocused)
                .accessibilityIdentifier("subir.error")
            Button("Reintentar") { Task { await viewModel.retryPreview() } }
                .prominentButton().controlSize(.large)
                .accessibilityIdentifier("subir.retry")
            Button("Elegir otro archivo") { isPickingFile = true }
                .buttonStyle(.bordered).controlSize(.large)
                .accessibilityIdentifier("subir.chooseOther")
        case .decidiendo(let preview):
            deciding(preview)
        case .revisando:
            // Drawn by `ReviewView`, outside this scroll view.
            EmptyView()
        case .subiendo:
            Progress(text: "Subiendo transacciones…", identifier: "subir.uploading")
        case .errorImportacion(let failure):
            StatusMessage(text: failure.message, isError: true)
                .accessibilityFocused($messageFocused)
                .accessibilityIdentifier("subir.error")
            if failure.isRetryable {
                Button("Reintentar") { Task { await viewModel.retryImport() } }
                    .prominentButton().controlSize(.large)
                    .accessibilityIdentifier("subir.retry")
            }
            if viewModel.canReturnToReview {
                Button("Volver a revisar") { viewModel.backToReview() }
                    .buttonStyle(.bordered).controlSize(.large)
                    .accessibilityIdentifier("subir.backToReview")
            }
            Button("Empezar de nuevo") { viewModel.discard() }
                .buttonStyle(.bordered).controlSize(.large)
                .accessibilityIdentifier("subir.startOver")
        case .exito(let summary):
            success(summary)
        }
    }

    private var hasMessage: Bool {
        switch viewModel.state {
        case .inicial(let message): message != nil
        case .protegido, .errorPrevia, .errorImportacion, .exito: true
        default: false
        }
    }

    private var initial: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Sube tu cartola")
                    .font(.title3.bold())
                    .foregroundStyle(Color.Mirach.Base.foreground)
                    .accessibilityAddTraits(.isHeader)
                Text("Archivos .xlsx o .pdf de Banco de Chile, BancoEstado, BCI y Santander, de hasta 10 MB.")
                Text("Primero verás una vista previa. Nada se guarda hasta que confirmes.")
            }
            .foregroundStyle(Color.Mirach.Base.mutedForeground)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("subir.instructions")

            Button { isPickingFile = true } label: {
                Label("Elegir archivo", systemImage: "doc.badge.plus").frame(maxWidth: .infinity)
            }
            .prominentButton().controlSize(.large)
            .accessibilityIdentifier("subir.chooseFile")

            importsLink

            if let testFixtureURL {
                Button("Usar archivo de prueba") { Task { await viewModel.chooseFile(testFixtureURL) } }
                    .buttonStyle(.bordered).controlSize(.large)
                    .accessibilityIdentifier("subir.fixture")
            }
        }
    }

    private func deciding(_ preview: CartolaPreview) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            if let file = viewModel.stagedFile {
                Text("\(file.filename) · \(file.byteCount.formatted(.byteCount(style: .file)))")
                    .font(.footnote)
                    .foregroundStyle(Color.Mirach.Base.mutedForeground)
                    .accessibilityIdentifier("subir.file")
            }
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(preview.banco).font(.headline)
                    Text("\(preview.tipoCuenta) · \(preview.numeroCuenta)")
                        .font(.subheadline)
                        .foregroundStyle(Color.Mirach.Base.mutedForeground)
                }
                .accessibilityElement(children: .combine)
                counts(preview)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.Mirach.Base.card)
            .overlay(Rectangle().stroke(Color.Mirach.Base.border))
            .foregroundStyle(Color.Mirach.Base.foreground)
            .accessibilityIdentifier("subir.summary")

            Text("Nada se ha guardado aún.")
                .foregroundStyle(Color.Mirach.Base.mutedForeground)

            Button { Task { await viewModel.uploadAsIs() } } label: {
                Text("Subir tal cual").frame(maxWidth: .infinity)
            }
            .prominentButton().controlSize(.large)
            .accessibilityIdentifier("subir.uploadAsIs")
            reviewEntry
            Button("Descartar", role: .destructive) { confirmingDiscard = true }
                .buttonStyle(.bordered).controlSize(.large)
                .accessibilityIdentifier("subir.discard")
        }
    }

    /// «Revisar y editar» needs the catalog; if it could not load, the rest of the flow still
    /// works and this says why the button is off.
    @ViewBuilder
    private var reviewEntry: some View {
        Button { viewModel.startReview() } label: {
            Text("Revisar y editar").frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered).controlSize(.large)
        .disabled(viewModel.loadedCatalog == nil)
        .accessibilityIdentifier("subir.review")
        switch viewModel.catalog {
        case .loaded: EmptyView()
        case .loading:
            Label("Cargando categorías…", systemImage: "arrow.triangle.2.circlepath")
                .font(.footnote)
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
                .accessibilityIdentifier("subir.catalogLoading")
        case .failed:
            Text("No pudimos cargar tus categorías, así que no se puede revisar. Puedes subir tal cual.")
                .font(.footnote)
                .foregroundStyle(Color.Mirach.Feedback.errorText)
                .accessibilityIdentifier("subir.catalogError")
            Button("Reintentar") { Task { await viewModel.retryCatalog() } }
                .buttonStyle(.bordered).controlSize(.regular)
                .accessibilityIdentifier("subir.catalogRetry")
        }
    }

    /// Three counters; at large text sizes they stack so no figure is cut.
    @ViewBuilder
    private func counts(_ preview: CartolaPreview) -> some View {
        let items = [
            ("Total filas", preview.totalFilas), ("Duplicados", preview.duplicados), ("Nuevas", preview.nuevas),
        ]
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
            : AnyLayout(HStackLayout(alignment: .top, spacing: 16))
        layout {
            ForEach(items, id: \.0) { label, value in
                VStack(alignment: .leading, spacing: 2) {
                    Text(label).font(.footnote).foregroundStyle(Color.Mirach.Base.mutedForeground)
                    Text(String(value)).font(.title3.bold()).mirachFigures()
                }
                .accessibilityElement(children: .combine)
            }
        }
    }

    /// The way to the imports already made, to check or undo one.
    private var importsLink: some View {
        NavigationLink(value: CartolasSubidasRoute()) {
            HStack {
                Label("Cartolas subidas", systemImage: "tray.full")
                Spacer()
                Image(systemName: "chevron.right").accessibilityHidden(true)
            }
        }
        .buttonStyle(SecondaryButtonStyle(ink: Color.Mirach.Base.foreground))
        .accessibilityIdentifier("subir.cartolasSubidas")
    }

    private func success(_ summary: SubirCartolaViewModel.ImportSummary) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.largeTitle)
                    .foregroundStyle(Color.Mirach.Feedback.successText)
                    .accessibilityHidden(true)
                Text(summary.headline).font(.title3.bold())
                if let line = summary.duplicatesLine {
                    Text(line).foregroundStyle(Color.Mirach.Base.mutedForeground)
                }
            }
            .foregroundStyle(Color.Mirach.Base.foreground)
            .accessibilityElement(children: .combine)
            .accessibilityFocused($messageFocused)
            .accessibilityIdentifier("subir.success")

            Button { onShowSummary() } label: {
                Text("Ver resumen del mes").frame(maxWidth: .infinity)
            }
            .prominentButton().controlSize(.large)
            .accessibilityIdentifier("subir.viewSummary")
            Button("Subir otra cartola") { viewModel.discard() }
                .buttonStyle(.bordered).controlSize(.large)
                .accessibilityIdentifier("subir.another")
            importsLink
        }
    }
}

private struct Progress: View {
    let text: String
    let identifier: String

    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text(text).foregroundStyle(Color.Mirach.Base.mutedForeground)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 48)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(identifier)
    }
}

private struct StatusMessage: View {
    let text: String
    let isError: Bool

    var body: some View {
        Text(text)
            .foregroundStyle(isError ? Color.Mirach.Feedback.errorText : Color.Mirach.Base.foreground)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityIdentifier("subir.message")
    }
}

/// The reactive password step. The text lives only in this view's `@State` until sent, then in
/// the view model's memory; never on disk, never logged.
private struct PasswordPrompt: View {
    let filename: String
    let incorrect: Bool
    let submit: (String) -> Void
    let chooseOther: () -> Void
    var messageFocus: AccessibilityFocusState<Bool>.Binding

    @State private var password = ""
    @FocusState private var fieldFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(filename).font(.footnote).foregroundStyle(Color.Mirach.Base.mutedForeground)
            StatusMessage(
                text: SubirCartolaViewModel.State.passwordPrompt(incorrect: incorrect), isError: incorrect
            )
            .accessibilityFocused(messageFocus)
            .accessibilityIdentifier("subir.passwordPrompt")

            // Hidden text; no autocorrect, capitals or suggestions: it is a bank password.
            SecureField("Contraseña del archivo", text: $password)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($fieldFocused)
                .submitLabel(.go)
                .onSubmit(send)
                .padding(12)
                .overlay(Rectangle().stroke(Color.Mirach.Base.input))
                .accessibilityIdentifier("subir.password")

            Button("Reintentar", action: send)
                .prominentButton().controlSize(.large)
                .disabled(password.isEmpty)
                .accessibilityIdentifier("subir.retry")
            Button("Elegir otro archivo", action: chooseOther)
                .buttonStyle(.bordered).controlSize(.large)
                .accessibilityIdentifier("subir.chooseOther")
        }
        .onAppear { fieldFocused = true }
        // A wrong attempt clears the field and keeps the focus, ready for the next one.
        .onChange(of: incorrect) { password = ""; fieldFocused = true }
    }

    private func send() {
        guard !password.isEmpty else { return }
        submit(password)
        password = ""
    }
}
