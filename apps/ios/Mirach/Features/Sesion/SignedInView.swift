import SwiftUI

/// The signed-in area: the tab bar of the catalog (Resumen, Movimientos, Subir, Categorías, Perfil).
struct SignedInView: View {
    enum Tab: Hashable { case resumen, movimientos, subir, categorias, perfil }

    let environment: AppEnvironment.Dependencies
    @State private var selection = Tab.resumen
    @State private var versionViewModel: ApiVersionViewModel
    /// Bumped after each import so the Resumen reloads the new data.
    @State private var resumenReload = 0
    /// Bumped with `resumenReload` for everything that changes the month's movements from outside
    /// the Movimientos tab (its own moves reload the Resumen but not itself).
    @State private var movimientosReload = 0
    /// Bumped after each write to the catalog, wherever it happened: every screen that shows
    /// categories (Resumen, a bucket detail, Categorías, the review of a statement) reads again.
    @State private var catalogRevision = 0

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
                catalogRevision: catalogRevision,
                onCatalogChange: catalogChanged,
                onUploadStatement: { selection = .subir }
            )
            .tabItem { Label("Resumen", systemImage: "chart.pie") }
            .tag(Tab.resumen)

            MovimientosView(
                api: environment.api,
                reloadToken: movimientosReload,
                catalogRevision: catalogRevision,
                onChanged: { resumenReload += 1 }
            )
            .tabItem { Label("Movimientos", systemImage: "list.bullet") }
            .tag(Tab.movimientos)

            SubirCartolaView(
                viewModel: environment.subir,
                api: environment.api,
                onCartolaDeleted: statementsChanged,
                onShowSummary: { selection = .resumen },
                testFixtureURL: AppEnvironment.uiTestFixtureURL()
            )
            .tabItem { Label("Subir", systemImage: "square.and.arrow.up") }
            .tag(Tab.subir)

            CategoriasView(api: environment.api, catalogRevision: catalogRevision, onChange: catalogChanged)
                .tabItem { Label("Categorías", systemImage: "tag") }
                .tag(Tab.categorias)

            PerfilView(
                viewModel: PerfilViewModel(
                    api: environment.api, session: environment.session, googleSignIn: environment.googleSignIn
                ),
                api: environment.api,
                // A new profile changes every month's targets: the Resumen reads again.
                onBudgetProfileSaved: statementsChanged
            )
                .tabItem { Label("Perfil", systemImage: "person.crop.circle") }
                .tag(Tab.perfil)
        }
        .onChange(of: environment.subir.importsCompleted) { statementsChanged() }
        // After a merge the account has new statements, movements and categories: everything reads again.
        .onChange(of: environment.session.mergeRevision) {
            statementsChanged()
            catalogChanged()
        }
        // The whole area leaves the screen on sign-out (also after a 401): drop the file copy
        // and any password. Switching tabs does not trigger this.
        .onDisappear { environment.subir.discard() }
    }

    /// An import, a deleted statement, a saved profile or a merge: the Resumen and the movements read again.
    private func statementsChanged() {
        resumenReload += 1
        movimientosReload += 1
    }

    private func catalogChanged() {
        catalogRevision += 1
        Task { await environment.subir.catalogDidChange() }
    }
}
