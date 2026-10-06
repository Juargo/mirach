import SwiftUI

/// "Resumen del mes": the signed-in home. Read-only in this version; the entry points to
/// bucket detail, income and upload arrive with those screens.
struct ResumenView: View {
    let versionViewModel: ApiVersionViewModel
    /// Changing it reloads the month (a statement was just imported).
    let reloadToken: Int
    /// "Subir cartola" in the empty state: the shell opens the Subir tab.
    let onUploadStatement: () -> Void
    @State private var viewModel: ResumenViewModel
    @State private var loadedToken: Int?
    private let api: any MirachAPI

    init(
        api: any MirachAPI, versionViewModel: ApiVersionViewModel,
        reloadToken: Int = 0, onUploadStatement: @escaping () -> Void = {}
    ) {
        self.api = api
        self.versionViewModel = versionViewModel
        self.reloadToken = reloadToken
        self.onUploadStatement = onUploadStatement
        _viewModel = State(initialValue: ResumenViewModel(api: api))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    content
                    ApiVersionFootnote(viewModel: versionViewModel)
                        .frame(maxWidth: .infinity)
                }
                .padding(16)
            }
            // Pull to refresh repeats the query for the month on screen.
            .refreshable { await viewModel.refresh() }
            .background(Color.Mirach.Base.background)
            .navigationTitle("Resumen")
            .navigationBarTitleDisplayMode(.inline)
            // Runs when the screen appears (and again when `reloadToken` changes) and is
            // cancelled when it goes away.
            .task(id: reloadToken) {
                // Coming back from a bucket's detail restarts this task: the month the person
                // chose must survive that, so only a new token (or the first time) reloads.
                guard loadedToken != reloadToken else { return }
                await viewModel.load()
                if !Task.isCancelled { loadedToken = reloadToken }
            }
            .navigationDestination(for: BucketRoute.self) { route in
                DetalleBucketView(
                    api: api, bucket: route.bucket, periodo: route.periodo,
                    // A move changes this month's figures too: repeat the query for the month on screen.
                    onReclassified: { Task { await viewModel.refresh() } }
                )
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading:
            VStack(spacing: 12) {
                ProgressView()
                Text("Cargando tu resumen…")
                    .foregroundStyle(Color.Mirach.Base.mutedForeground)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 48)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("resumen.loading")
        case .failed(let failure):
            ErrorBlock(failure: failure) { Task { await viewModel.retry() } }
        case .loaded(let mes):
            MonthSelector(
                periodo: mes.periodo,
                anterior: viewModel.anterior,
                siguiente: viewModel.siguiente,
                select: { periodo in Task { await viewModel.select(periodo) } }
            )
            if mes.sinIngreso {
                EmptyMonth(onUpload: onUploadStatement)
            } else {
                ResumenContent(mes: mes)
            }
        }
    }
}

private struct EmptyMonth: View {
    let onUpload: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            // The two texts read as one element for VoiceOver; the button stays its own
            // element so it remains reachable.
            VStack(spacing: 8) {
                Text("Todavía no hay datos este mes")
                    .font(.headline)
                    .foregroundStyle(Color.Mirach.Base.foreground)
                Text("Cuando subas una cartola, aquí verás cómo se repartió tu mes.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.Mirach.Base.mutedForeground)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("resumen.empty")
            Button("Subir cartola", action: onUpload)
                .prominentButton()
                .controlSize(.large)
                .padding(.top, 8)
                .accessibilityIdentifier("resumen.upload")
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 32)
    }
}

private struct ErrorBlock: View {
    let failure: ResumenViewModel.Failure
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Text(message)
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.Mirach.Feedback.errorText)
            Button("Reintentar", action: retry)
                .prominentButton()
                .accessibilityIdentifier("resumen.retry")
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 48)
        .accessibilityIdentifier("resumen.error")
    }

    private var message: String {
        switch failure {
        case .connection: "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."
        case .server: "No pudimos cargar el resumen. Inténtalo de nuevo en unos segundos."
        }
    }
}
