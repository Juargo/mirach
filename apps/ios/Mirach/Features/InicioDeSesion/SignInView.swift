import AuthenticationServices
import SwiftUI

struct SignInView: View {
    @State private var viewModel: SignInViewModel
    /// Why the person is here when it was not their doing (their account was deleted).
    private let notice: SessionController.SignedOutNotice?
    /// Bumping this restarts the `.task(id:)` below, so "Reintentar" stays structured.
    @State private var retryCount = 0
    @Environment(\.colorScheme) private var colorScheme

    init(viewModel: SignInViewModel, notice: SessionController.SignedOutNotice? = nil) {
        self.notice = notice
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            // The review form plus the keyboard can exceed a small screen: scroll instead of clipping.
            GeometryReader { proxy in
                ScrollView {
                    column.frame(minHeight: proxy.size.height)
                }
                .scrollBounceBehavior(.basedOnSize)
                .scrollDismissesKeyboard(.interactively)
            }
            .background(Color.Mirach.Base.background)
            .navigationBarHidden(true)
        }
        // Runs when the screen appears and again when `retryCount` changes.
        .task(id: retryCount) { await viewModel.loadProviders() }
    }

    private var column: some View {
            VStack(spacing: 24) {
                Spacer()
                VStack(spacing: 8) {
                    Text("Mirach")
                        .font(.largeTitle.bold())
                        .foregroundStyle(Color.Mirach.Base.foreground)
                    Text("Inicia sesión para ver tus finanzas.")
                        .foregroundStyle(Color.Mirach.Base.mutedForeground)
                }
                if let notice {
                    Label(notice.message, systemImage: "checkmark.circle")
                        .multilineTextAlignment(.center)
                        .foregroundStyle(Color.Mirach.Feedback.successText)
                        // One VoiceOver element that reads only the message: on iOS 26 the
                        // icon is otherwise its own element announced as "Seleccionado".
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(notice.message)
                        .accessibilityIdentifier("signin.notice")
                }
                content
                Spacer()
            }
            .padding()
            .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loadingProviders:
            ProgressView("Cargando…")
        case .ready, .authenticating:
            VStack(spacing: 16) {
                if viewModel.appleLoginAvailable { appleButton }
                if viewModel.passwordLoginAvailable { PasswordSignInForm(viewModel: viewModel) }
                if viewModel.state == .authenticating {
                    ProgressView("Iniciando sesión…")
                }
                if let message = viewModel.errorMessage {
                    // Never color alone: the icon and the text carry the meaning too.
                    Label(message, systemImage: "exclamationmark.circle")
                        .foregroundStyle(Color.Mirach.Feedback.errorText)
                        .multilineTextAlignment(.center)
                        .accessibilityIdentifier("signin.error")
                }
            }
        case .noProviders:
            retryBlock("El inicio de sesión no está disponible por ahora")
        case .providersFailed(let message):
            retryBlock(message)
        }
    }

    private var appleButton: some View {
        // The system button: Apple requires its look and wording. `.continue` renders
        // "Continuar con Apple" (the app's only language is Spanish).
        SignInWithAppleButton(.continue) { request in
            // Name and email are only delivered the first time; the nonce is per attempt.
            request.requestedScopes = [.fullName, .email]
            request.nonce = viewModel.prepareAppleRequest()
        } onCompletion: { result in
            // A callback cannot be `async`, so it starts one task for the whole attempt.
            Task { await viewModel.completeAppleSignIn(Self.credential(from: result)) }
        }
        .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
        .frame(height: 50)
        .disabled(viewModel.state == .authenticating)
        .accessibilityIdentifier("signin.apple")
    }

    private func retryBlock(_ message: String) -> some View {
        VStack(spacing: 12) {
            Text(message).multilineTextAlignment(.center)
            Button("Reintentar") { retryCount += 1 }
                .prominentButton()
        }
    }

    private static func credential(
        from result: Result<ASAuthorization, any Error>
    ) -> Result<AppleCredential, any Error> {
        Result { try AppleCredential(authorization: result.get()) }
    }
}
