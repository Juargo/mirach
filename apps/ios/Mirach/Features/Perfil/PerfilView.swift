import SwiftUI

/// "Perfil": edit the name, see the email, sign out, delete the account.
struct PerfilView: View {
    @State private var viewModel: PerfilViewModel
    @State private var confirmingDeletion = false
    @Environment(\.dynamicTypeSize) private var typeSize

    init(viewModel: PerfilViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    content
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
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
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.loadState {
        case .loading:
            VStack(spacing: 12) {
                ProgressView()
                Text("Cargando tu perfil…").foregroundStyle(Color.Mirach.Base.mutedForeground)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 48)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("perfil.loading")
        case .failed:
            VStack(spacing: 12) {
                Text(viewModel.loadFailureMessage ?? "")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.Mirach.Feedback.errorText)
                Button("Reintentar") { Task { await viewModel.load() } }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("perfil.retry")
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 48)
            .accessibilityIdentifier("perfil.error")
        case .loaded:
            nameSection
            if let email = viewModel.email { emailSection(email) }
            sessionSection
        }
    }

    // MARK: sections

    private var nameSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Nombre").font(.footnote).foregroundStyle(Color.Mirach.Base.mutedForeground)
            TextField("Nombre", text: $viewModel.nombre)
                .textContentType(.name)
                .submitLabel(.done)
                .onSubmit { Task { await viewModel.save() } }
                .padding(12)
                .overlay(Rectangle().stroke(Color.Mirach.Base.input))
                .foregroundStyle(Color.Mirach.Base.foreground)
                .disabled(viewModel.isBusyWithSession)
                .accessibilityIdentifier("perfil.nombre")
            Button {
                Task { await viewModel.save() }
            } label: {
                if viewModel.saveState == .saving {
                    ProgressView()
                } else {
                    Text("Guardar")
                }
            }
            .buttonStyle(.borderedProminent).controlSize(.large)
            .disabled(!viewModel.canSave)
            .accessibilityLabel(viewModel.saveState == .saving ? "Guardando" : "Guardar")
            .accessibilityIdentifier("perfil.save")
            if let message = viewModel.saveFailureMessage {
                Label(message, systemImage: "exclamationmark.circle")
                    .foregroundStyle(Color.Mirach.Feedback.errorText)
                    .accessibilityIdentifier("perfil.saveError")
            } else if viewModel.saveState == .saved, !viewModel.hasNameChanges {
                Label(PerfilViewModel.savedMessage, systemImage: "checkmark.circle")
                    .foregroundStyle(Color.Mirach.Feedback.successText)
                    .accessibilityIdentifier("perfil.saved")
            }
        }
    }

    private func emailSection(_ email: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Correo").font(.footnote).foregroundStyle(Color.Mirach.Base.mutedForeground)
            // Read only. It may be Apple's private relay address.
            Text(email)
                .foregroundStyle(Color.Mirach.Base.foreground)
                .textSelection(.enabled)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("perfil.email")
    }

    private var sessionSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Divider()
            Button {
                Task { await viewModel.signOut() }
            } label: {
                if viewModel.isSigningOut {
                    Label("Cerrando sesión…", systemImage: "hourglass")
                } else {
                    Text("Cerrar sesión")
                }
            }
            .buttonStyle(.bordered).controlSize(.large)
            .disabled(viewModel.isBusyWithSession)
            .accessibilityIdentifier("perfil.signOut")

            // Easy to find, as the App Store requires, and clearly separate from signing out.
            Button("Eliminar cuenta", role: .destructive) { confirmingDeletion = true }
                .buttonStyle(.bordered).controlSize(.large)
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
                VStack(alignment: .leading, spacing: 16) {
                    Text("Esta acción no se puede deshacer")
                        .font(.title3.bold())
                        .foregroundStyle(Color.Mirach.Base.foreground)
                        .accessibilityAddTraits(.isHeader)
                    Text("Se eliminarán tu cuenta, tus cartolas, tus movimientos, tus categorías y tus patrones. No podrás recuperarlos.")
                        .foregroundStyle(Color.Mirach.Base.foreground)
                        .accessibilityIdentifier("perfil.delete.warning")
                    Text("Para confirmar, escribe \(PerfilViewModel.confirmationWord).")
                        .foregroundStyle(Color.Mirach.Base.mutedForeground)

                    // No autocorrect, capitals or suggestions: the word must be typed exactly.
                    TextField(PerfilViewModel.confirmationWord, text: $viewModel.deleteConfirmation)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .textContentType(.none)
                        .focused($fieldFocused)
                        .padding(12)
                        .overlay(Rectangle().stroke(Color.Mirach.Base.input))
                        .foregroundStyle(Color.Mirach.Base.foreground)
                        .disabled(viewModel.deleteState == .deleting)
                        .accessibilityIdentifier("perfil.delete.field")

                    if let message = viewModel.deleteFailureMessage {
                        Label(message, systemImage: "exclamationmark.circle")
                            .foregroundStyle(Color.Mirach.Feedback.errorText)
                            .accessibilityIdentifier("perfil.delete.error")
                    }

                    Button(role: .destructive) {
                        Task { await viewModel.deleteAccount() }
                    } label: {
                        if viewModel.deleteState == .deleting {
                            Label("Eliminando cuenta…", systemImage: "hourglass")
                        } else {
                            Text("Eliminar definitivamente")
                        }
                    }
                    .buttonStyle(.borderedProminent).controlSize(.large)
                    .tint(Color.Mirach.Base.destructive)
                    .disabled(!viewModel.canDelete)
                    .accessibilityIdentifier("perfil.delete.confirm")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
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
            .onAppear { fieldFocused = true }
        }
    }
}
