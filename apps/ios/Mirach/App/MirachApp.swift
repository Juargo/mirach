import SwiftUI

@main
struct MirachApp: App {
    /// Built once, at launch; `@State` keeps the same instances for the app's whole life.
    @State private var environment = AppEnvironment.make()

    var body: some Scene {
        WindowGroup {
            RootView(environment: environment)
        }
    }
}
