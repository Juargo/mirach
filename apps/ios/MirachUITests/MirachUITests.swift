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
    private func launchWithFixture(_ name: String, _ ext: String, _ extra: [String] = []) throws -> XCUIApplication {
        let url = try XCTUnwrap(Bundle(for: MirachUITests.self).url(forResource: name, withExtension: ext))
        return launch([savedSession, "-uiTestFixturePath", url.path] + extra)
    }

    private func openSubirTab(_ app: XCUIApplication) {
        XCTAssertTrue(app.staticTexts["resumen.month"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Subir"].tap()
    }

    private func element(_ app: XCUIApplication, _ identifier: String) -> XCUIElement {
        app.descendants(matching: .any)[identifier].firstMatch
    }

    @MainActor
    func testLaunchWithSavedSessionShowsTheResumen() {
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

        // "Cerrar sesión" lives in Perfil now: the temporary menu is gone.
        XCTAssertFalse(app.buttons["resumen.menu"].exists)
        XCTAssertFalse(app.buttons["signedin.signOut"].exists)
    }

    // MARK: Perfil

    private func openPerfilTab(_ app: XCUIApplication) {
        XCTAssertTrue(app.staticTexts["resumen.month"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Perfil"].tap()
    }

    @MainActor
    func testPerfilShowsTheProfileAndSignOutReturnsToSignIn() {
        let app = launch([savedSession])
        openPerfilTab(app)

        let name = app.textFields["perfil.nombre"]
        XCTAssertTrue(name.waitForExistence(timeout: 10))
        XCTAssertEqual(name.value as? String, "Persona de prueba")
        XCTAssertTrue(element(app, "perfil.email").label.contains("persona@example.com"))
        XCTAssertFalse(app.buttons["perfil.save"].isEnabled, "no changes yet")

        app.buttons["perfil.signOut"].tap()

        XCTAssertTrue(app.buttons["signin.apple"].waitForExistence(timeout: 10))
        XCTAssertFalse(element(app, "signin.notice").exists, "a plain sign-out leaves no notice")
    }

    @MainActor
    func testEditingTheNameEnablesSaveAndConfirmsIt() {
        let app = launch([savedSession])
        openPerfilTab(app)
        let name = app.textFields["perfil.nombre"]
        XCTAssertTrue(name.waitForExistence(timeout: 10))

        name.tap()
        name.typeText(" Dos")
        XCTAssertTrue(app.buttons["perfil.save"].isEnabled)
        app.buttons["perfil.save"].tap()

        XCTAssertTrue(element(app, "perfil.saved").waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["perfil.save"].isEnabled)
    }

    @MainActor
    func testDeletingTheAccountNeedsTheTypedWordAndReturnsToSignInWithANotice() {
        let app = launch([savedSession])
        openPerfilTab(app)
        XCTAssertTrue(app.buttons["perfil.delete"].waitForExistence(timeout: 10))
        app.buttons["perfil.delete"].tap()

        let field = app.textFields["perfil.delete.field"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        let confirm = app.buttons["perfil.delete.confirm"]
        XCTAssertFalse(confirm.isEnabled)
        field.typeText("ELIMINA")
        XCTAssertFalse(confirm.isEnabled, "a partial word does not count")
        field.typeText("R")
        XCTAssertTrue(confirm.isEnabled)
        confirm.tap()

        XCTAssertTrue(app.buttons["signin.apple"].waitForExistence(timeout: 10))
        XCTAssertEqual(element(app, "signin.notice").label, "Tu cuenta y tus datos se eliminaron")
    }

    @MainActor
    func testCancellingTheDeletionKeepsThePersonSignedIn() {
        let app = launch([savedSession])
        openPerfilTab(app)
        app.buttons["perfil.delete"].tap()
        XCTAssertTrue(app.buttons["perfil.delete.cancel"].waitForExistence(timeout: 10))

        app.buttons["perfil.delete.cancel"].tap()

        XCTAssertTrue(app.buttons["perfil.signOut"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["signin.apple"].exists)
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

    // MARK: Revisar y editar

    @MainActor
    func testReviewingOneChangedCategoryIsConfirmedAsExactlyOneEdit() throws {
        let app = try launchWithFixture("cartola-ejemplo", "xlsx")
        openSubirTab(app)
        app.buttons["subir.fixture"].tap()
        XCTAssertTrue(app.buttons["subir.review"].waitForExistence(timeout: 10))
        // The catalog loads after the decision shows; the button enables when it is there.
        let reviewEnabled = NSPredicate(format: "isEnabled == true")
        expectation(for: reviewEnabled, evaluatedWith: app.buttons["subir.review"])
        waitForExpectations(timeout: 10)

        app.buttons["subir.review"].tap()
        let row = element(app, "review.row.1")
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        XCTAssertTrue(row.label.contains("Sin categoría") == false)
        XCTAssertTrue(row.label.contains("Deseos · Desconocido"), "no suggestion: \(row.label)")

        // A duplicate shows its mark and opens nothing.
        let duplicate = element(app, "review.row.5")
        XCTAssertTrue(duplicate.label.contains("Ya cargado"), duplicate.label)
        duplicate.tap()
        XCTAssertFalse(element(app, "review.sheet").waitForExistence(timeout: 1))

        row.tap()
        XCTAssertTrue(element(app, "review.sheet").waitForExistence(timeout: 5))
        // The sheet opens half height and its list is lazy: scroll to the Ahorro group.
        let fund = app.buttons["review.category.stub-aho-fondo"]
        var swipes = 0
        while !fund.isHittable && swipes < 5 {
            app.swipeUp()
            swipes += 1
        }
        XCTAssertTrue(fund.isHittable, "the category never became tappable")
        fund.tap()

        XCTAssertTrue(element(app, "review.sheet").waitForNonExistence(timeout: 5))
        XCTAssertTrue(row.label.contains("Ahorro · Fondo de emergencia"), row.label)
        XCTAssertTrue(row.label.contains("editada"), row.label)
        XCTAssertEqual(app.buttons["review.confirm"].label, "Confirmar (1 cambio)")

        app.buttons["review.confirm"].tap()
        XCTAssertTrue(element(app, "subir.success").waitForExistence(timeout: 10))
        // The stub answers with the number of edits it received.
        XCTAssertTrue(app.staticTexts["1 movimiento importado de Banco de Chile"].exists)
    }

    @MainActor
    func testDiscardingFromTheReviewAsksForConfirmation() throws {
        let app = try launchWithFixture("cartola-ejemplo", "xlsx")
        openSubirTab(app)
        app.buttons["subir.fixture"].tap()
        expectation(for: NSPredicate(format: "isEnabled == true"), evaluatedWith: app.buttons["subir.review"])
        waitForExpectations(timeout: 10)
        app.buttons["subir.review"].tap()
        XCTAssertTrue(app.buttons["review.discard"].waitForExistence(timeout: 10))

        app.buttons["review.discard"].tap()
        XCTAssertTrue(app.alerts.buttons["Seguir con la cartola"].waitForExistence(timeout: 5))
        app.alerts.buttons["Descartar"].tap()

        XCTAssertTrue(app.buttons["subir.chooseFile"].waitForExistence(timeout: 10))
    }

    @MainActor
    func testAtTheLargestTextSizeAReviewRowIsReachableWithOneSwipe() throws {
        let app = try launchWithFixture(
            "cartola-ejemplo", "xlsx",
            ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        )
        openSubirTab(app)
        // Large text can push the tab bar items around; the fixture button is in the content.
        let fixture = app.buttons["subir.fixture"]
        XCTAssertTrue(fixture.waitForExistence(timeout: 10))
        if !fixture.isHittable { app.swipeUp() }
        fixture.tap()
        let review = app.buttons["subir.review"]
        XCTAssertTrue(review.waitForExistence(timeout: 10))
        if !review.isHittable { app.swipeUp() }
        expectation(for: NSPredicate(format: "isEnabled == true"), evaluatedWith: review)
        waitForExpectations(timeout: 10)
        review.tap()

        // The header scrolls with the rows, so one swipe must bring a row into reach.
        let row = element(app, "review.row.0")
        XCTAssertTrue(app.buttons["review.confirm"].waitForExistence(timeout: 10))
        var swipes = 0
        while !row.isHittable && swipes < 1 {
            app.swipeUp()
            swipes += 1
        }
        XCTAssertTrue(row.isHittable, "no review row reachable within one swipe at the largest text size")
    }

    @MainActor
    func testCreatingACategoryFromARowAppliesItAndReportsTheOtherMatchingRows() throws {
        let app = try launchWithFixture("cartola-ejemplo", "xlsx")
        openSubirTab(app)
        app.buttons["subir.fixture"].tap()
        expectation(for: NSPredicate(format: "isEnabled == true"), evaluatedWith: app.buttons["subir.review"])
        waitForExpectations(timeout: 10)
        app.buttons["subir.review"].tap()
        let row = element(app, "review.row.1")
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        row.tap()
        XCTAssertTrue(element(app, "review.sheet").waitForExistence(timeout: 5))

        app.buttons["review.create"].tap()
        let name = app.textFields["category.name"]
        XCTAssertTrue(name.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["category.save"].isEnabled, "a name and a group are required")
        name.tap()
        // Return closes the keyboard so the group rows below are reachable.
        name.typeText("Amigos\n")
        app.buttons["category.bucket.Deseos"].tap()
        // The pattern comes prefilled with the row's description.
        let pattern = app.textFields["category.pattern"]
        if !pattern.exists { app.swipeUp() }
        XCTAssertEqual(pattern.value as? String, "TRANSF A JUAN PEREZ")
        app.buttons["category.save"].tap()

        // The sheet closes; the notice counts the two other transfers the pattern now matches.
        XCTAssertTrue(element(app, "review.info").waitForExistence(timeout: 10))
        XCTAssertEqual(element(app, "review.info").label, "«Amigos» se aplicó a 2 filas más")
        XCTAssertTrue(row.label.contains("Deseos · Amigos"), row.label)
        XCTAssertEqual(app.buttons["review.confirm"].label, "Confirmar (1 cambio)")
    }

    @MainActor
    func testACategoryNameThatExistsShowsAFieldErrorAndKeepsWhatWasTyped() throws {
        let app = try launchWithFixture("cartola-ejemplo", "xlsx")
        openSubirTab(app)
        app.buttons["subir.fixture"].tap()
        expectation(for: NSPredicate(format: "isEnabled == true"), evaluatedWith: app.buttons["subir.review"])
        waitForExpectations(timeout: 10)
        app.buttons["subir.review"].tap()
        let row = element(app, "review.row.1")
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        row.tap()
        app.buttons["review.create"].tap()
        let name = app.textFields["category.name"]
        XCTAssertTrue(name.waitForExistence(timeout: 5))
        name.tap()
        name.typeText("Supermercado\n")
        app.buttons["category.bucket.Deseos"].tap()
        app.buttons["category.save"].tap()

        XCTAssertTrue(element(app, "category.error.name").waitForExistence(timeout: 5))
        XCTAssertEqual(element(app, "category.error.name").label, "Ya tienes una categoría con ese nombre")
        XCTAssertEqual(name.value as? String, "Supermercado")
    }
}
