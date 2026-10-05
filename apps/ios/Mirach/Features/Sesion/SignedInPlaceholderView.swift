import SwiftUI

/// TEMPORARY signed-in area: proves the session works. The real first screen is
/// "Resumen del mes" (next task).
struct SignedInPlaceholderView: View {
    let session: SessionController
    let versionViewModel: ApiVersionViewModel

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Spacer()
                Text("Sesión iniciada")
                    .font(.title2.bold())
                    .foregroundStyle(Color.Mirach.Base.foreground)
                Text("Tu sesión está activa. El resumen del mes llegará pronto.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.Mirach.Base.mutedForeground)
                Button("Cerrar sesión") { session.signOut() }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("signedin.signOut")
                Spacer()
                ApiVersionFootnote(viewModel: versionViewModel)
            }
            .padding()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.Mirach.Base.background)
            .navigationBarHidden(true)
        }
    }
}
