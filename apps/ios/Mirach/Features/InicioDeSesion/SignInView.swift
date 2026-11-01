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
                VStack(spacing: 16) {
                    BrandRing()
                    Text("Mirach")
                        .font(.mirach(.largeTitle).bold())
                        .foregroundStyle(Color.Mirach.Base.foreground)
                    Text("¿Estoy gastando bien? Te lo mostramos en un vistazo: necesidades, gustos y ahorro.")
                        .multilineTextAlignment(.center)
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
                Spacer()
                content
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
                if let message = viewModel.errorMessage {
                    errorBlock(message, detail: viewModel.errorDetail)
                }
                if viewModel.state == .authenticating {
                    ProgressView("Iniciando sesión…")
                }
                if viewModel.appleLoginAvailable { appleButton }
                if viewModel.passwordLoginAvailable { PasswordSignInForm(viewModel: viewModel) }
                legalNotice
            }
        case .noProviders:
            retryBlock("El inicio de sesión no está disponible por ahora")
        case .providersFailed(let message):
            retryBlock(message)
        }
    }

    @ViewBuilder
    private func errorBlock(_ message: String, detail: String?) -> some View {
        if let detail {
            VStack(alignment: .leading, spacing: 4) {
                Text(message).font(.mirach(.subheadline).weight(.medium))
                    .foregroundStyle(Color.Mirach.Base.foreground)
                Text(detail).font(.mirach(.subheadline))
                    .foregroundStyle(Color.Mirach.Base.mutedForeground)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(Color.Mirach.Base.card)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("signin.error")
        } else {
            // Never color alone: the icon and the text carry the meaning too.
            Label(message, systemImage: "exclamationmark.circle")
                .foregroundStyle(Color.Mirach.Feedback.errorText)
                .multilineTextAlignment(.center)
                .accessibilityIdentifier("signin.error")
        }
    }

    private var legalNotice: some View {
        let text = "Al continuar aceptas los [Términos](\(LegalDocuments.terminosURL)) "
            + "y la [Política de privacidad](\(LegalDocuments.privacidadURL)). No pedimos claves de tu banco."
        return Text(.init(text))
            .font(.mirach(.caption))
            .multilineTextAlignment(.center)
            .foregroundStyle(Color.Mirach.Base.mutedForeground)
            .tint(Color.Mirach.Base.foreground)
            .accessibilityIdentifier("signin.legal")
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

/// The 50/30/20 mark of the welcome screen. Decorative: the text next to it carries the meaning.
private struct BrandRing: View {
    private let segments: [(from: CGFloat, to: CGFloat, color: Color)] = [
        (0, 0.5, Color.Mirach.Bucket.necesidades),
        (0.5, 0.8, Color.Mirach.Bucket.gustos),
        (0.8, 1, Color.Mirach.Bucket.ahorro),
    ]

    var body: some View {
        ZStack {
            ForEach(segments.indices, id: \.self) { index in
                let segment = segments[index]
                Circle()
                    .trim(from: segment.from + 0.004, to: segment.to - 0.004)
                    .stroke(segment.color, lineWidth: 20)
            }
        }
        .rotationEffect(.degrees(-90))
        .frame(width: 124, height: 124)
        .padding(10)
        .accessibilityHidden(true)
    }
}
