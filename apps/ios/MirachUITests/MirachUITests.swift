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
        XCTAssertFalse(app.buttons["Mes anterior"].isEnabled)
        XCTAssertTrue(app.buttons["Mes siguiente"].isEnabled)
    }

    @MainActor
    func testMissingAPIKeyShowsTheConfigurationErrorInsteadOfSignIn() {
        let app = launch([missingAPIKey])

        XCTAssertTrue(app.staticTexts["La app no está configurada correctamente"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["signin.apple"].exists)
    }
}
