import SwiftUI

/// Decides what the person sees from the session's `phase`: the single place that
/// turns "who is signed in" into a screen.
struct RootView: View {
    let environment: AppEnvironment.Dependencies
    /// Bumping this restarts the `.task(id:)` below, so retry stays structured.
    @State private var retryCount = 0

    var body: some View {
        content
            .task(id: retryCount) {
                // Nothing to validate when the build itself is broken.
                guard environment.configurationProblem == nil else { return }
                await environment.session.start()
            }
    }

    @ViewBuilder
    private var content: some View {
        if environment.configurationProblem != nil {
            ConfigurationErrorView()
        } else {
            switch environment.session.phase {
            case .validating:
                StatusView(message: "Verificando tu sesión… la primera vez puede tardar hasta un minuto.")
            case .signedOut:
                SignInView(viewModel: SignInViewModel(api: environment.api, session: environment.session))
            case .signedIn:
                SignedInView(environment: environment)
            case .connectionFailed:
                VStack(spacing: 12) {
                    Text("Problema de conexión. Revisa tu conexión e inténtalo de nuevo.")
                        .multilineTextAlignment(.center)
                    Button("Reintentar") { retryCount += 1 }
                        .buttonStyle(.borderedProminent)
                }
                .padding()
            case .misconfigured:
                ConfigurationErrorView()
            }
        }
    }
}

private struct StatusView: View {
    let message: String

    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text(message)
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
        }
        .padding()
    }
}
