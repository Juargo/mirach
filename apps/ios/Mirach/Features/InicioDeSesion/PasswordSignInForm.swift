import SwiftUI

/// The App Review email and password form (ADR-051). The sign-in screen shows it only when the
/// server enables it, behind a quiet toggle so Sign in with Apple stays the primary path.
struct PasswordSignInForm: View {
    let viewModel: SignInViewModel
    @State private var isOpen = false
    @State private var email = ""
    @State private var password = ""
    @FocusState private var focus: Field?

    private enum Field { case email, password }

    private var isSubmitting: Bool { viewModel.state == .authenticating }
    private var canSubmit: Bool {
        !isSubmitting && !email.trimmingCharacters(in: .whitespaces).isEmpty && !password.isEmpty
    }

    var body: some View {
        VStack(spacing: 12) {
            Button(isOpen ? "Ocultar acceso con correo" : "Acceso con correo") {
                isOpen.toggle()
            }
            .buttonStyle(SecondaryButtonStyle(ink: Color.Mirach.Base.foreground))
            .accessibilityIdentifier("signin.password.toggle")

            if isOpen {
                VStack(spacing: 12) {
                    TextField("Correo", text: $email)
                        .keyboardType(.emailAddress)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focus, equals: .email)
                        .submitLabel(.next)
                        .onSubmit { focus = .password }
                        .modifier(FieldFrame())
                        .accessibilityIdentifier("signin.email")
                    SecureField("Contraseña", text: $password)
                        .textContentType(.password)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focus, equals: .password)
                        .submitLabel(.go)
                        .onSubmit(submit)
                        .modifier(FieldFrame())
                        .accessibilityIdentifier("signin.password")
                    Button("Ingresar", action: submit)
                        .prominentButton()
                        .disabled(!canSubmit)
                        .accessibilityIdentifier("signin.password.submit")
                }
            }
        }
        .disabled(isSubmitting && !isOpen)
    }

    private func submit() {
        guard canSubmit else { return }
        focus = nil
        // The fields stay filled on failure; a success replaces this screen.
        Task { await viewModel.signInWithPassword(email: email, password: password) }
    }
}

private struct FieldFrame: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(12)
            .overlay(Rectangle().stroke(Color.Mirach.Base.input))
    }
}
