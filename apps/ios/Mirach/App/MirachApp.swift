import SwiftUI

@main
struct MirachApp: App {
    /// Built once, at launch; `@State` keeps the same instances for the app's whole life.
    @State private var environment = AppEnvironment.make()

    var body: some Scene {
        WindowGroup {
            RootView(environment: environment)
                // The system blue fails contrast on the dark surfaces; the token has a variant per theme.
                .tint(Color.Mirach.Base.primary)
        }
    }
}
