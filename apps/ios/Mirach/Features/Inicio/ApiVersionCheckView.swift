import SwiftUI

/// TEMPORARY screen: shows the API version to prove networking works.
struct ApiVersionCheckView: View {
    @State private var viewModel: ApiVersionViewModel
    /// Bumping this restarts the `.task(id:)` below, so retry stays structured.
    @State private var retryCount = 0

    init(viewModel: ApiVersionViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            content
                .padding()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .navigationTitle("Conexión con la API")
        }
        // Runs when the view appears and again whenever `retryCount` changes;
        // SwiftUI cancels it when the view goes away.
        .task(id: retryCount) { await viewModel.load() }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .idle, .loading:
            VStack(spacing: 12) {
                ProgressView()
                Text("Conectando… la primera vez puede tardar hasta un minuto.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }
        case .loaded(let info):
            VStack(spacing: 8) {
                // Design tokens: color adapts to light/dark, figures use tabular digits.
                Text("Versión \(info.version)")
                    .font(.title2.bold())
                    .mirachFigures()
                    .foregroundStyle(Color.Mirach.Base.foreground)
                Text("Commit \(info.commit)").foregroundStyle(Color.Mirach.Base.mutedForeground)
            }
        case .failed(let message):
            VStack(spacing: 12) {
                Text(message).multilineTextAlignment(.center)
                Button("Reintentar") { retryCount += 1 }
                    .buttonStyle(.borderedProminent)
            }
        }
    }
}
