import SwiftUI

@main
struct MirachApp: App {
    var body: some Scene {
        WindowGroup {
            ApiVersionCheckView(
                viewModel: ApiVersionViewModel(client: AppEnvironment.makeHTTPClient())
            )
        }
    }
}
