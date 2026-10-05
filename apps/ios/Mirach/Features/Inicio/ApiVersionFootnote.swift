import SwiftUI

/// A discreet line with the deployed API build (`GET /version`, public). It stayed from
/// the first connectivity screen because it is a cheap way to see which backend the
/// app is talking to. It shows nothing while loading or when the call fails.
struct ApiVersionFootnote: View {
    @State private var viewModel: ApiVersionViewModel

    init(viewModel: ApiVersionViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        // Always a Text (empty until loaded): `.task` needs a real view to attach to,
        // an `if` that produces nothing would never start the request.
        Text(label)
            .font(.footnote)
            .mirachFigures()
            .foregroundStyle(Color.Mirach.Base.mutedForeground)
            .accessibilityIdentifier("signedin.apiVersion")
            // Runs when the view appears and is cancelled when it goes away.
            .task { await viewModel.load() }
    }

    private var label: String {
        if case .loaded(let info) = viewModel.state { return "API \(info.version) · \(info.commit)" }
        return ""
    }
}
