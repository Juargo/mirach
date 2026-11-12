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
                        VStack(alignment: .leading, spacing: MirachSpacing.m) {
                            content
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, MirachSpacing.l)
                        .padding(.vertical, MirachSpacing.m)
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
            // The consent (PRI-02) is checked when the flow opens and again whenever it comes back to
            // the initial screen (a revocation from "Perfil", PRI-06); with a file in progress it does nothing.
            .task { await viewModel.start() }
        }
    }

    private static let allowedTypes: [UTType] = [.pdf, UTType(filenameExtension: "xlsx")].compactMap { $0 }

    // MARK: states

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .preparando:
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.top, 48)
                .accessibilityIdentifier("subir.preparing")
        case .consentimiento(let failed):
            consent(failed: failed, isAccepting: false)
        case .aceptandoConsentimiento:
            consent(failed: false, isAccepting: true)
        case .consentimientoPospuesto:
            StatusMessage(text: SubirCartolaViewModel.consentDismissedMessage, isError: false)
                .accessibilityFocused($messageFocused)
            Button { viewModel.showConsent() } label: {
                Text(SubirCartolaViewModel.consentReopen).frame(maxWidth: .infinity)
            }
            .prominentButton()
            .accessibilityIdentifier("subir.consent.reopen")
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
                .prominentButton()
                .accessibilityIdentifier("subir.retry")
            Button("Elegir otro archivo") { isPickingFile = true }
                .secondaryButton()
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
                    .prominentButton()
                    .accessibilityIdentifier("subir.retry")
            }
            if viewModel.canReturnToReview {
                Button("Volver a revisar") { viewModel.backToReview() }
                    .secondaryButton()
                    .accessibilityIdentifier("subir.backToReview")
            }
            Button("Empezar de nuevo") { viewModel.discard() }
                .secondaryButton()
                .accessibilityIdentifier("subir.startOver")
        case .exito(let summary):
            success(summary)
        }
    }

    private var hasMessage: Bool {
        switch viewModel.state {
        case .inicial(let message): message != nil
        case .consentimiento(let failed): failed
        case .consentimientoPospuesto: true
        case .protegido, .errorPrevia, .errorImportacion, .exito: true
        default: false
        }
    }

    private var initial: some View {
        VStack(alignment: .leading, spacing: MirachSpacing.m) {
            VStack(spacing: MirachSpacing.s) {
                Text("Sube tu cartola")
                    .mirachText(.titulo)
                    .foregroundStyle(Color.Mirach.Base.foreground)
                    .accessibilityAddTraits(.isHeader)
                Text("Archivos .xlsx o .pdf de Banco de Chile, BancoEstado, BCI y Santander, de hasta 10 MB.")
                    .mirachText(.cuerpo)
                Text("Primero verás una vista previa. Nada se guarda hasta que confirmes.")
                    .mirachText(.cuerpo)
            }
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .foregroundStyle(Color.Mirach.Base.mutedForeground)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("subir.instructions")

            // PRI-03: no bank passwords, the file is deleted after reading it.
            Text(SubirCartolaViewModel.initialPrivacyMessage)
                .mirachText(.etiqueta)
                .foregroundStyle(Color.Mirach.Base.foreground)
                .accessibilityIdentifier("subir.privacy")

            Button { isPickingFile = true } label: {
                Label("Elegir archivo", systemImage: "doc.badge.plus").frame(maxWidth: .infinity)
            }
            .prominentButton()
            .accessibilityIdentifier("subir.chooseFile")

            importsLink

            if let testFixtureURL {
                Button("Usar archivo de prueba") { Task { await viewModel.chooseFile(testFixtureURL) } }
                    .secondaryButton()
                    .accessibilityIdentifier("subir.fixture")
            }
        }
    }

    /// The PRI-02 consent (Figma 16, node 114:442), shown before the first upload.
    private func consent(failed: Bool, isAccepting: Bool) -> some View {
        VStack(alignment: .leading, spacing: MirachSpacing.m) {
            VStack(spacing: MirachSpacing.s) {
                Text(SubirCartolaViewModel.consentTitle)
                    .mirachText(.titulo)
                    .foregroundStyle(Color.Mirach.Base.foreground)
                    .accessibilityAddTraits(.isHeader)
                Text(SubirCartolaViewModel.consentBody)
                    .mirachText(.cuerpo)
                    .foregroundStyle(Color.Mirach.Base.mutedForeground)
            }
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .accessibilityIdentifier("subir.consent")

            VStack(alignment: .leading, spacing: 6) {
                Text(SubirCartolaViewModel.consentListHeader)
                    .mirachText(.etiqueta)
                    .foregroundStyle(Color.Mirach.Base.cardForeground)
                    .accessibilityAddTraits(.isHeader)
                ForEach(SubirCartolaViewModel.consentItems, id: \.self) { item in
                    Text(item)
                        .mirachText(.etiqueta)
                        .foregroundStyle(Color.Mirach.Base.mutedForeground)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.Mirach.Base.card)
            .accessibilityIdentifier("subir.consent.list")

            if failed {
                StatusMessage(text: SubirCartolaViewModel.consentAcceptFailedMessage, isError: true)
                    .accessibilityFocused($messageFocused)
            }
            Button { Task { await viewModel.acceptConsent() } } label: {
                Group {
                    if isAccepting { ProgressView() } else { Text(SubirCartolaViewModel.consentAccept) }
                }
                .frame(maxWidth: .infinity)
            }
            .prominentButton()
            .disabled(isAccepting)
            .accessibilityLabel(SubirCartolaViewModel.consentAccept)
            .accessibilityIdentifier("subir.consent.accept")
            Button { viewModel.declineConsent() } label: {
                Text(SubirCartolaViewModel.consentDecline).frame(maxWidth: .infinity)
            }
            .secondaryButton()
            .disabled(isAccepting)
            .accessibilityIdentifier("subir.consent.decline")
        }
    }

    private func deciding(_ preview: CartolaPreview) -> some View {
        VStack(alignment: .leading, spacing: MirachSpacing.m) {
            if let file = viewModel.stagedFile {
                Text("\(file.filename) · \(file.byteCount.formatted(.byteCount(style: .file)))")
                    .mirachText(.etiqueta)
                    .foregroundStyle(Color.Mirach.Base.mutedForeground)
                    .accessibilityIdentifier("subir.file")
            }
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(preview.banco).mirachText(.cuerpoDestacado)
                    Text("\(preview.tipoCuenta) · \(preview.numeroCuenta)")
                        .mirachText(.etiqueta)
                        .foregroundStyle(Color.Mirach.Base.mutedForeground)
                }
                .accessibilityElement(children: .combine)
                counts(preview)
            }
            .padding(MirachSpacing.m)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.Mirach.Base.card)
            .overlay(Rectangle().stroke(Color.Mirach.Base.border))
            .foregroundStyle(Color.Mirach.Base.foreground)
            .accessibilityIdentifier("subir.summary")

            // A server that predates the summary sends none: the screen is the one before it.
            if let clasificacion = preview.clasificacion {
                PreviewSummaryView(preview: preview, clasificacion: clasificacion)
            }

            Text("Nada se ha guardado aún.")
                .mirachText(.etiqueta)
                .frame(maxWidth: .infinity)
                .foregroundStyle(Color.Mirach.Base.mutedForeground)

            // With rows in Desconocido, reviewing is the recommended action, so it leads.
            if preview.clasificacion.map(PreviewSummaryPresentation.reviewIsPrimary) ?? false {
                reviewEntry(primary: true)
                uploadAsIs(primary: false)
            } else {
                uploadAsIs(primary: true)
                reviewEntry(primary: false)
            }
            Button("Descartar", role: .destructive) { confirmingDiscard = true }
                .secondaryButton()
                .accessibilityIdentifier("subir.discard")
        }
    }

    @ViewBuilder
    private func uploadAsIs(primary: Bool) -> some View {
        let button = Button { Task { await viewModel.uploadAsIs() } } label: {
            Text("Subir tal cual").frame(maxWidth: .infinity)
        }
        if primary {
            button.prominentButton().accessibilityIdentifier("subir.uploadAsIs")
        } else {
            button.secondaryButton().accessibilityIdentifier("subir.uploadAsIs")
        }
    }

    /// «Revisar y editar» needs the catalog; if it could not load, the rest of the flow still
    /// works and this says why the button is off.
    @ViewBuilder
    private func reviewEntry(primary: Bool) -> some View {
        let button = Button { viewModel.startReview() } label: {
            Text("Revisar y editar").frame(maxWidth: .infinity)
        }
        if primary {
            button.prominentButton()
                .disabled(viewModel.loadedCatalog == nil)
                .accessibilityIdentifier("subir.review")
        } else {
            button.secondaryButton()
                .disabled(viewModel.loadedCatalog == nil)
                .accessibilityIdentifier("subir.review")
        }
        switch viewModel.catalog {
        case .loaded: EmptyView()
        case .loading:
            Label("Cargando categorías…", systemImage: "arrow.triangle.2.circlepath")
                .mirachText(.etiqueta)
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
                .accessibilityIdentifier("subir.catalogLoading")
        case .failed:
            Text("No pudimos cargar tus categorías, así que no se puede revisar. Puedes subir tal cual.")
                .mirachText(.etiqueta)
                .foregroundStyle(Color.Mirach.Feedback.errorText)
                .accessibilityIdentifier("subir.catalogError")
            Button("Reintentar") { Task { await viewModel.retryCatalog() } }
                .secondaryButton()
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
                    Text(label).mirachText(.etiqueta).foregroundStyle(Color.Mirach.Base.mutedForeground)
                    Text(String(value)).mirachText(.cuerpoDestacado).mirachFigures()
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
        .secondaryButton()
        .accessibilityIdentifier("subir.cartolasSubidas")
    }

    private func success(_ summary: SubirCartolaViewModel.ImportSummary) -> some View {
        VStack(alignment: .leading, spacing: MirachSpacing.m) {
            VStack(alignment: .leading, spacing: MirachSpacing.s) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.mirach(.largeTitle))
                    .foregroundStyle(Color.Mirach.Feedback.successText)
                    .accessibilityHidden(true)
                Text(summary.headline).mirachText(.titulo)
                if let line = summary.duplicatesLine {
                    Text(line).mirachText(.cuerpo).foregroundStyle(Color.Mirach.Base.mutedForeground)
                }
            }
            .foregroundStyle(Color.Mirach.Base.foreground)
            .accessibilityElement(children: .combine)
            .accessibilityFocused($messageFocused)
            .accessibilityIdentifier("subir.success")

            Button { onShowSummary() } label: {
                Text("Ver resumen del mes").frame(maxWidth: .infinity)
            }
            .prominentButton()
            .accessibilityIdentifier("subir.viewSummary")
            Button("Subir otra cartola") { viewModel.discard() }
                .secondaryButton()
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
            Text(text).mirachText(.cuerpo).foregroundStyle(Color.Mirach.Base.mutedForeground)
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
            .mirachText(.cuerpo)
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
        VStack(alignment: .leading, spacing: MirachSpacing.m) {
            Text(filename).mirachText(.etiqueta).foregroundStyle(Color.Mirach.Base.mutedForeground)
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
                .mirachField(isError: incorrect)
                .accessibilityIdentifier("subir.password")

            Button("Reintentar", action: send)
                .prominentButton()
                .disabled(password.isEmpty)
                .accessibilityIdentifier("subir.retry")
            Button("Elegir otro archivo", action: chooseOther)
                .secondaryButton()
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
