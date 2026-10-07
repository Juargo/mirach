import SwiftUI

/// The signed-in area: the tab bar. Only the tabs whose screens exist (the catalog's
/// Categorías arrives with its screen).
struct SignedInView: View {
    enum Tab: Hashable { case resumen, subir, perfil }

    let environment: AppEnvironment.Dependencies
    @State private var selection = Tab.resumen
    @State private var versionViewModel: ApiVersionViewModel
    /// Bumped after each import so the Resumen reloads the new data.
    @State private var resumenReload = 0

    init(environment: AppEnvironment.Dependencies) {
        self.environment = environment
        _versionViewModel = State(initialValue: ApiVersionViewModel(api: environment.api))
    }

    var body: some View {
        TabView(selection: $selection) {
            ResumenView(
                api: environment.api,
                versionViewModel: versionViewModel,
                reloadToken: resumenReload,
                onUploadStatement: { selection = .subir }
            )
            .tabItem { Label("Resumen", systemImage: "chart.pie") }
            .tag(Tab.resumen)

            SubirCartolaView(
                viewModel: environment.subir,
                api: environment.api,
                onCartolaDeleted: { resumenReload += 1 },
                onShowSummary: { selection = .resumen },
                testFixtureURL: AppEnvironment.uiTestFixtureURL()
            )
            .tabItem { Label("Subir", systemImage: "square.and.arrow.up") }
            .tag(Tab.subir)

            PerfilView(viewModel: PerfilViewModel(api: environment.api, session: environment.session))
                .tabItem { Label("Perfil", systemImage: "person.crop.circle") }
                .tag(Tab.perfil)
        }
        .onChange(of: environment.subir.importsCompleted) { resumenReload += 1 }
        // The whole area leaves the screen on sign-out (also after a 401): drop the file copy
        // and any password. Switching tabs does not trigger this.
        .onDisappear { environment.subir.discard() }
    }
}
