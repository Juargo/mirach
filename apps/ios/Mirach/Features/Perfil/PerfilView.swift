import AuthenticationServices
import SwiftUI

/// "Perfil": edit the name, see the email, revoke the statement consent, sign out, delete the account.
struct PerfilView: View {
    @State private var viewModel: PerfilViewModel
    @State private var confirmingDeletion = false
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.authorizationController) private var authorizationController

    init(viewModel: PerfilViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: MirachSpacing.l) {
                    content
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(MirachSpacing.l)
            }
            // The colour reaches every edge, not only the content's height.
            .background(Color.Mirach.Base.background.ignoresSafeArea(.all))
            .navigationTitle("Perfil")
            .navigationBarTitleDisplayMode(.inline)
            // Runs on appearing, cancelled when the screen goes away.
            .task { await viewModel.load() }
            .sheet(isPresented: $confirmingDeletion, onDismiss: viewModel.resetDeletion) {
                DeleteAccountSheet(viewModel: viewModel)
            }
            .onChange(of: viewModel.saveState) {
                if viewModel.saveState == .saved {
                    AccessibilityNotification.Announcement(PerfilViewModel.savedMessage).post()
                }
            }
            .onChange(of: viewModel.revokeState) {
                if viewModel.revokeState == .revoked {
                    AccessibilityNotification.Announcement(PerfilViewModel.revokedMessage).post()
                }
            }
            // Only "Revocar" reaches the API.
            .alert(PerfilViewModel.revokeConfirmationTitle, isPresented: $viewModel.isConfirmingRevocation) {
                Button(PerfilViewModel.revokeConfirmButton, role: .destructive) {
                    Task { await viewModel.revokeConsent() }
                }
                Button(PerfilViewModel.revokeCancelButton, role: .cancel) { viewModel.cancelRevocation() }
            } message: {
                Text(PerfilViewModel.revokeConfirmationMessage)
            }
            // "Entrar y unir datos" is the only way to continue; cancelling sends nothing.
            .alert(PerfilViewModel.existingAccountTitle, isPresented: $viewModel.isConfirmingExistingAccount) {
                Button(PerfilViewModel.existingAccountConfirmButton) {
                    Task { await viewModel.enterExistingAccount() }
                }
                Button(PerfilViewModel.existingAccountCancelButton, role: .cancel) {
                    viewModel.cancelExistingAccount()
                }
            } message: {
                Text(PerfilViewModel.existingAccountMessage)
            }
            .onChange(of: viewModel.linkState) {
                if viewModel.linkState == .linked {
                    AccessibilityNotification.Announcement(PerfilViewModel.linkedMessage).post()
                }
            }
            .onChange(of: viewModel.mergeState) {
                if viewModel.mergeState == .merged {
                    AccessibilityNotification.Announcement(PerfilViewModel.mergedMessage).post()
                }
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.loadState {
        case .loading:
            VStack(spacing: 12) {
                ProgressView()
                Text("Cargando tu perfil…").mirachText(.cuerpo).foregroundStyle(Color.Mirach.Base.mutedForeground)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 48)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("perfil.loading")
        case .failed:
            VStack(spacing: 12) {
                Text(viewModel.loadFailureMessage ?? "")
                    .mirachText(.cuerpo)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.Mirach.Feedback.errorText)
                Button("Reintentar") { Task { await viewModel.load() } }
                    .prominentButton()
                    .accessibilityIdentifier("perfil.retry")
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 48)
            .accessibilityIdentifier("perfil.error")
        case .loaded:
            nameSection
            if let email = viewModel.email { emailSection(email) }
            if viewModel.showsLinkSection { linkSection }
            if viewModel.showsMergeSection || viewModel.mergeResultMessage != nil || viewModel.mergeFailureMessage != nil {
                mergeSection
            }
            if let message = viewModel.linkedNotice {
                Label(message, systemImage: "checkmark.circle")
                    .mirachText(.etiqueta)
                    .foregroundStyle(Color.Mirach.Feedback.successText)
                    .accessibilityIdentifier("perfil.linked")
            }
            // Hidden while the consent is unknown (loading, or its check failed).
            if let text = viewModel.consentText { consentSection(text) }
            sessionSection
        }
    }

    // MARK: sections

    private var nameSection: some View {
        VStack(alignment: .leading, spacing: MirachSpacing.s) {
            SectionLabel("Nombre")
            TextField("Nombre", text: $viewModel.nombre, axis: .vertical)
                .lineLimit(1...4)
                .textContentType(.name)
                .submitLabel(.done)
                .onSubmit { Task { await viewModel.save() } }
                // A growing field is a text view, where Return would add a line: treat it as
                // "done" instead and keep newlines out of the name.
                .onChange(of: viewModel.nombre) {
                    guard viewModel.nombre.contains(where: \.isNewline) else { return }
                    viewModel.nombre = viewModel.nombre.filter { !$0.isNewline }
                    Task { await viewModel.save() }
                }
                .mirachField()
                .disabled(viewModel.isBusyWithSession)
                .accessibilityIdentifier("perfil.nombre")
            Button {
                Task { await viewModel.save() }
            } label: {
                Group {
                    if viewModel.saveState == .saving { ProgressView() } else { Text("Guardar") }
                }
                .frame(maxWidth: .infinity)
            }
            .prominentButton()
            .disabled(!viewModel.canSave)
            .accessibilityLabel(viewModel.saveState == .saving ? "Guardando" : "Guardar")
            .accessibilityIdentifier("perfil.save")
            if let message = viewModel.saveFailureMessage {
                Label(message, systemImage: "exclamationmark.circle")
                    .mirachText(.etiqueta)
                    .foregroundStyle(Color.Mirach.Feedback.errorText)
                    .accessibilityIdentifier("perfil.saveError")
            } else if viewModel.saveState == .saved, !viewModel.hasNameChanges {
                Label(PerfilViewModel.savedMessage, systemImage: "checkmark.circle")
                    .mirachText(.etiqueta)
                    .foregroundStyle(Color.Mirach.Feedback.successText)
                    .accessibilityIdentifier("perfil.saved")
            }
        }
    }

    private func emailSection(_ email: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            SectionLabel("Correo")
            // Read only. It may be Apple's private relay address.
            Text(email)
                .mirachText(.cuerpo)
                .foregroundStyle(Color.Mirach.Base.foreground)
                .textSelection(.enabled)
                // A long address wraps instead of being cut; a little scaling keeps most on one line.
                .minimumScaleFactor(0.75)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("perfil.email")
    }

    /// "Respalda tus datos": only for an anonymous account, only the providers the server offers.
    private var linkSection: some View {
        VStack(alignment: .leading, spacing: MirachSpacing.s) {
            VStack(alignment: .leading, spacing: MirachSpacing.xs) {
                SectionLabel(PerfilViewModel.linkTitle)
                Text(PerfilViewModel.linkText)
                    .mirachText(.cuerpo)
                    .foregroundStyle(Color.Mirach.Base.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("perfil.link.text")
            }
            if viewModel.appleLinkAvailable {
                Button {
                    Task { await linkWithApple() }
                } label: {
                    Label(PerfilViewModel.linkAppleTitle, systemImage: "apple.logo").frame(maxWidth: .infinity)
                }
                .buttonStyle(SecondaryButtonStyle(ink: Color.Mirach.Base.foreground))
                .disabled(viewModel.linkState == .linking || viewModel.isBusyWithSession)
                .accessibilityIdentifier("perfil.link.apple")
            }
            if viewModel.googleLinkAvailable {
                Button {
                    Task { await viewModel.linkWithGoogle() }
                } label: {
                    HStack(spacing: 10) {
                        GoogleLogo()
                        Text(PerfilViewModel.linkGoogleTitle)
                    }
                    .frame(maxWidth: .infinity)
                }
                .secondaryButton()
                .disabled(viewModel.linkState == .linking || viewModel.isBusyWithSession)
                .accessibilityIdentifier("perfil.link.google")
            }
            if viewModel.linkState == .linking {
                ProgressView().accessibilityIdentifier("perfil.link.progress")
            }
            if let message = viewModel.linkFailureMessage {
                Label(message, systemImage: "exclamationmark.circle")
                    .mirachText(.etiqueta)
                    .foregroundStyle(Color.Mirach.Feedback.errorText)
                    .accessibilityIdentifier("perfil.link.error")
            }
        }
        // `.contain` keeps the children's own identifiers (a bare identifier here overrides them).
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("perfil.link")
    }

    /// "Datos de este dispositivo": an anonymous session parked beside an ordinary one (ADR-014).
    /// The result stays after the parked item is gone, so it is drawn outside the section's guard.
    private var mergeSection: some View {
        VStack(alignment: .leading, spacing: MirachSpacing.s) {
            if viewModel.showsMergeSection {
                VStack(alignment: .leading, spacing: MirachSpacing.xs) {
                    SectionLabel(PerfilViewModel.mergeTitle)
                    Text(PerfilViewModel.mergeText)
                        .mirachText(.cuerpo)
                        .foregroundStyle(Color.Mirach.Base.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("perfil.merge.text")
                }
                Button {
                    Task { await viewModel.mergeParkedData() }
                } label: {
                    Text(PerfilViewModel.mergeActionTitle).frame(maxWidth: .infinity)
                }
                .buttonStyle(SecondaryButtonStyle(ink: Color.Mirach.Base.foreground))
                .disabled(viewModel.isMerging || viewModel.isBusyWithSession)
                .accessibilityIdentifier("perfil.merge.action")
            }
            if viewModel.isMerging {
                ProgressView().accessibilityIdentifier("perfil.merge.progress")
            }
            if let message = viewModel.mergeFailureMessage {
                Label(message, systemImage: "exclamationmark.circle")
                    .mirachText(.etiqueta)
                    .foregroundStyle(Color.Mirach.Feedback.errorText)
                    .accessibilityIdentifier("perfil.merge.error")
            } else if let message = viewModel.mergeResultMessage {
                Label(message, systemImage: "checkmark.circle")
                    .mirachText(.etiqueta)
                    .foregroundStyle(Color.Mirach.Feedback.successText)
                    .accessibilityIdentifier("perfil.merge.result")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("perfil.merge")
    }

    /// Reuses the sign-in feature's credential and nonce; only the sheet is requested here, with
    /// the system's own authorization controller (the stock button's label cannot say "Vincular").
    private func linkWithApple() async {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = viewModel.prepareAppleLink()
        do {
            let result = try await authorizationController.performRequests([request])
            guard case .appleID(let credential) = result else {
                await viewModel.completeAppleLink(.failure(AppleCredential.ConversionError.missingIdentityToken))
                return
            }
            await viewModel.completeAppleLink(Result { try AppleCredential(credential: credential) })
        } catch {
            await viewModel.completeAppleLink(.failure(error))
        }
    }

    private func consentSection(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: MirachSpacing.s) {
            VStack(alignment: .leading, spacing: MirachSpacing.xs) {
                SectionLabel(PerfilViewModel.consentTitle)
                Text(text)
                    .mirachText(.cuerpo)
                    .foregroundStyle(Color.Mirach.Base.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("perfil.consent.text")
            }
            if viewModel.showsRevokeButton {
                Button(role: .destructive) {
                    viewModel.askToRevoke()
                } label: {
                    // The same label while the request is out (as on Android); the button is disabled.
                    Text(PerfilViewModel.revokeButtonTitle).frame(maxWidth: .infinity)
                }
                .buttonStyle(SecondaryButtonStyle(ink: Color.Mirach.Feedback.errorText))
                .disabled(!viewModel.showsRevokeButtonEnabled)
                .accessibilityIdentifier("perfil.consent.revoke")
            }
            if let message = viewModel.revokeFailureMessage {
                Label(message, systemImage: "exclamationmark.circle")
                    .mirachText(.etiqueta)
                    .foregroundStyle(Color.Mirach.Feedback.errorText)
                    .accessibilityIdentifier("perfil.consent.error")
            } else if let message = viewModel.revokeMessage {
                Label(message, systemImage: "checkmark.circle")
                    .mirachText(.etiqueta)
                    .foregroundStyle(Color.Mirach.Feedback.successText)
                    .accessibilityIdentifier("perfil.consent.revoked")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("perfil.consent")
    }

    private var sessionSection: some View {
        VStack(alignment: .leading, spacing: MirachSpacing.s) {
            Divider().overlay(Color.Mirach.Base.border)
            // Signing out of an anonymous account would lose its data: not offered.
            if viewModel.offersSignOut {
                Button {
                    Task { await viewModel.signOut() }
                } label: {
                    Group {
                        if viewModel.isSigningOut {
                            Label("Cerrando sesión…", systemImage: "hourglass")
                        } else {
                            Text("Cerrar sesión")
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(SecondaryButtonStyle(ink: Color.Mirach.Base.foreground))
                .disabled(viewModel.isBusyWithSession)
                .accessibilityIdentifier("perfil.signOut")
            }

            // Easy to find, as the App Store requires, and clearly separate from signing out.
            Button(role: .destructive) {
                confirmingDeletion = true
            } label: {
                Text("Eliminar cuenta").frame(maxWidth: .infinity)
            }
            .buttonStyle(SecondaryButtonStyle(ink: Color.Mirach.Feedback.errorText))
            .disabled(viewModel.isBusyWithSession)
                .accessibilityIdentifier("perfil.delete")
        }
    }
}

/// The irreversible step: a screen of its own where the person types the word.
private struct DeleteAccountSheet: View {
    @Bindable var viewModel: PerfilViewModel
    @Environment(\.dismiss) private var dismiss
    @FocusState private var fieldFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: MirachSpacing.m) {
                    Text("Esta acción no se puede deshacer")
                        .mirachText(.titulo)
                        .foregroundStyle(Color.Mirach.Base.foreground)
                        .accessibilityAddTraits(.isHeader)
                    Text("Se eliminarán tu cuenta, tus cartolas, tus movimientos, tus categorías y tus patrones. No podrás recuperarlos.")
                        .mirachText(.cuerpo)
                        .foregroundStyle(Color.Mirach.Base.foreground)
                        .accessibilityIdentifier("perfil.delete.warning")
                    Text("Para confirmar, escribe \(PerfilViewModel.confirmationWord).")
                        .mirachText(.cuerpo)
                        .foregroundStyle(Color.Mirach.Base.mutedForeground)

                    // No autocorrect, capitals or suggestions: the word must be typed exactly.
                    TextField(PerfilViewModel.confirmationWord, text: $viewModel.deleteConfirmation)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .textContentType(.none)
                        .focused($fieldFocused)
                        .submitLabel(.done)
                        .onSubmit { fieldFocused = false }
                        .mirachField(isError: viewModel.deleteFailureMessage != nil)
                        .disabled(viewModel.deleteState == .deleting)
                        .accessibilityIdentifier("perfil.delete.field")

                    if let message = viewModel.deleteFailureMessage {
                        Label(message, systemImage: "exclamationmark.circle")
                            .mirachText(.etiqueta)
                            .foregroundStyle(Color.Mirach.Feedback.errorText)
                            .accessibilityIdentifier("perfil.delete.error")
                    }

                    Button(role: .destructive) {
                        Task { await viewModel.deleteAccount() }
                    } label: {
                        Group {
                            if viewModel.deleteState == .deleting {
                                Label("Eliminando cuenta…", systemImage: "hourglass")
                            } else {
                                Text("Eliminar definitivamente")
                            }
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .prominentButton()
                    .disabled(!viewModel.canDelete)
                    .accessibilityIdentifier("perfil.delete.confirm")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(MirachSpacing.l)
            }
            .background(Color.Mirach.Base.background.ignoresSafeArea(.all))
            .navigationTitle("Eliminar cuenta")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                        .disabled(viewModel.deleteState == .deleting)
                        .accessibilityIdentifier("perfil.delete.cancel")
                }
            }
            // Once the request is out there is no going back.
            .interactiveDismissDisabled(viewModel.deleteState == .deleting)
            // With the keyboard up the content scrolls (and its inset follows the keyboard), so
            // the confirm button stays reachable at any text size.
            .scrollDismissesKeyboard(.interactively)
            .onAppear { fieldFocused = true }
        }
    }
}
