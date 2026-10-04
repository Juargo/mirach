import SwiftUI

@main
struct MirachApp: App {
    var body: some Scene {
        WindowGroup {
            ApiVersionCheckView(
                viewModel: ApiVersionViewModel(api: AppEnvironment.makeAPI())
            )
        }
    }
}
