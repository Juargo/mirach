import XCTest

final class MirachUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor
    func testFirstScreenShowsTitleAndStubbedVersion() {
        let app = XCUIApplication()
        // Makes the app use a canned client instead of the real network.
        app.launchArguments += ["-uiTestStubbedClient"]
        app.launch()

        XCTAssertTrue(app.navigationBars["Conexión con la API"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Versión 0.0.0-stub"].waitForExistence(timeout: 10))
    }
}
