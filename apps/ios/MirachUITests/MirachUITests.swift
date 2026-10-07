import XCTest

final class MirachUITests: XCTestCase {
    // Launch arguments. They must match the constants in AppEnvironment (the UI test
    // bundle cannot import app code, so the literals are duplicated on purpose).
    private let stubbedClient = "-uiTestStubbedClient"   // canned API instead of the network
    private let savedSession = "-uiTestSavedSession"     // start as if already signed in
    private let missingAPIKey = "-uiTestMissingAPIKey"   // pretend the client key is empty

    override func setUp() {
        continueAfterFailure = false
    }

    private func launch(_ extraArguments: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += [stubbedClient] + extraArguments
        app.launch()
        return app
    }

    // Sign in with Apple itself cannot be automated (it needs the system sheet and an
    // Apple ID), so these tests cover everything around it.

    @MainActor
    func testLaunchWithoutSessionShowsTheAppleButton() {
        let app = launch()

        XCTAssertTrue(app.buttons["signin.apple"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["signedin.signOut"].exists)
    }

    /// A fixture file from this test bundle, handed to the app through a Debug-only launch
    /// argument (the system document picker cannot be driven reliably by XCUITest).
    private func launchWithFixture(_ name: String, _ ext: String) throws -> XCUIApplication {
        let url = try XCTUnwrap(Bundle(for: MirachUITests.self).url(forResource: name, withExtension: ext))
        return launch([savedSession, "-uiTestFixturePath", url.path])
    }

    private func openSubirTab(_ app: XCUIApplication) {
        XCTAssertTrue(app.staticTexts["resumen.month"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Subir"].tap()
    }

    private func element(_ app: XCUIApplication, _ identifier: String) -> XCUIElement {
        app.descendants(matching: .any)[identifier].firstMatch
    }

    @MainActor
    func testLaunchWithSavedSessionShowsTheResumenAndSignOutReturnsToSignIn() {
        let app = launch([savedSession])

        XCTAssertTrue(app.staticTexts["resumen.month"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["resumen.month"].label, "Septiembre de 2026")
        // The three buckets, by their official names (the third has no traffic-light state).
        for name in ["Necesidades", "Deseos", "Ahorro"] {
            let row = element(app, "resumen.bucket.\(name)")
            XCTAssertTrue(row.exists, "missing bucket row \(name)")
            XCTAssertTrue(row.label.hasPrefix(name), "row label: \(row.label)")
        }
        // The traffic light is hidden by product decision: no state label anywhere.
        for text in ["Estado del mes", "Muy Saludable", "Saludable", "En peligro", "Sin datos"] {
            let anywhere = NSPredicate(format: "label CONTAINS %@", text)
            XCTAssertEqual(app.descendants(matching: .any).matching(anywhere).count, 0, "found \(text)")
        }
        // The discreet API version line kept from the first screen (stubbed value).
        XCTAssertTrue(app.staticTexts["signedin.apiVersion"].waitForExistence(timeout: 10))

        app.buttons["resumen.menu"].tap()
        app.buttons["signedin.signOut"].tap()

        XCTAssertTrue(app.buttons["signin.apple"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["resumen.month"].exists)
    }

    @MainActor
    func testGoingBackTwoMonthsReachesTheEmptyMonthAndTheSelectorStaysUsable() {
        let app = launch([savedSession])
        XCTAssertTrue(app.staticTexts["resumen.month"].waitForExistence(timeout: 10))

        app.buttons["Mes anterior"].tap()
        XCTAssertTrue(app.staticTexts["Agosto de 2026"].waitForExistence(timeout: 10))
        app.buttons["Mes anterior"].tap()

        XCTAssertTrue(app.staticTexts["Julio de 2026"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Todavía no hay datos este mes"].exists)
        XCTAssertTrue(element(app, "resumen.empty").exists, "the empty state is one VoiceOver element")
        XCTAssertTrue(app.buttons["resumen.upload"].exists, "the button stays a separate element")
        XCTAssertFalse(app.buttons["Mes anterior"].isEnabled)
        XCTAssertTrue(app.buttons["Mes siguiente"].isEnabled)
    }

    @MainActor
    func testMissingAPIKeyShowsTheConfigurationErrorInsteadOfSignIn() {
        let app = launch([missingAPIKey])

        XCTAssertTrue(app.staticTexts["La app no está configurada correctamente"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["signin.apple"].exists)
    }

    // MARK: Subir cartola

    @MainActor
    func testSubirTabShowsTheInstructionsAndTheChooseFileButton() {
        let app = launch([savedSession])
        openSubirTab(app)

        XCTAssertTrue(app.buttons["subir.chooseFile"].waitForExistence(timeout: 10))
        let instructions = element(app, "subir.instructions")
        XCTAssertTrue(instructions.exists)
        XCTAssertTrue(instructions.label.contains(".xlsx"))
        XCTAssertTrue(instructions.label.contains("10 MB"))
    }

    @MainActor
    func testEmptyMonthUploadButtonOpensTheSubirTab() {
        let app = launch([savedSession])
        XCTAssertTrue(app.staticTexts["resumen.month"].waitForExistence(timeout: 10))
        app.buttons["Mes anterior"].tap()
        XCTAssertTrue(app.staticTexts["Agosto de 2026"].waitForExistence(timeout: 10))
        app.buttons["Mes anterior"].tap()
        XCTAssertTrue(app.staticTexts["Julio de 2026"].waitForExistence(timeout: 10))

        app.buttons["resumen.upload"].tap()

        XCTAssertTrue(app.buttons["subir.chooseFile"].waitForExistence(timeout: 10))
    }

    @MainActor
    func testUploadingAFileAsIsShowsTheSuccessAndOffersTheSummary() throws {
        let app = try launchWithFixture("cartola-ejemplo", "xlsx")
        openSubirTab(app)

        app.buttons["subir.fixture"].tap()
        XCTAssertTrue(app.buttons["subir.uploadAsIs"].waitForExistence(timeout: 10))
        XCTAssertTrue(element(app, "subir.summary").label.contains("Banco de Chile"))
        XCTAssertTrue(app.staticTexts["Nada se ha guardado aún."].exists)

        app.buttons["subir.uploadAsIs"].tap()
        XCTAssertTrue(element(app, "subir.success").waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["37 movimientos importados de Banco de Chile"].exists)
        XCTAssertTrue(app.staticTexts["5 duplicados omitidos"].exists)

        app.buttons["subir.viewSummary"].tap()
        XCTAssertTrue(app.staticTexts["resumen.month"].waitForExistence(timeout: 10))
    }

    @MainActor
    func testDiscardAsksForConfirmationAndGoesBackToTheStart() throws {
        let app = try launchWithFixture("cartola-ejemplo", "xlsx")
        openSubirTab(app)
        app.buttons["subir.fixture"].tap()
        XCTAssertTrue(app.buttons["subir.discard"].waitForExistence(timeout: 10))

        app.buttons["subir.discard"].tap()
        XCTAssertTrue(app.alerts.buttons["Seguir con la cartola"].waitForExistence(timeout: 5))
        app.alerts.buttons["Seguir con la cartola"].tap()
        XCTAssertTrue(app.buttons["subir.uploadAsIs"].exists, "cancelling the dialog keeps the decision")

        app.buttons["subir.discard"].tap()
        app.alerts.buttons["Descartar"].tap()
        XCTAssertTrue(app.buttons["subir.chooseFile"].waitForExistence(timeout: 10))
    }

    @MainActor
    func testAProtectedPdfAsksForThePasswordAndAcceptsTheRightOne() throws {
        let app = try launchWithFixture("cartola-protegida", "pdf")
        openSubirTab(app)

        app.buttons["subir.fixture"].tap()
        let field = app.secureTextFields["subir.password"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Este archivo está protegido. Ingresa su contraseña para continuar."].exists)

        field.typeText("mala")
        app.buttons["subir.retry"].tap()
        XCTAssertTrue(app.staticTexts["La contraseña es incorrecta. Inténtalo de nuevo."].waitForExistence(timeout: 10))

        field.tap()
        field.typeText("correcta")
        app.buttons["subir.retry"].tap()
        XCTAssertTrue(app.buttons["subir.uploadAsIs"].waitForExistence(timeout: 10))
    }
}
