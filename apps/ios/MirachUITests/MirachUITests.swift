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

        // The name field grows with the text, so it may be a text view: look it up by identifier.
        let name = element(app, "perfil.nombre")
        XCTAssertTrue(name.waitForExistence(timeout: 10))
        XCTAssertTrue(name.isHittable)
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
        let name = element(app, "perfil.nombre")
        XCTAssertTrue(name.waitForExistence(timeout: 10))
        XCTAssertTrue(name.isHittable)

        name.tap()
        name.typeWhenFocused(" Dos")
        XCTAssertTrue(app.buttons["perfil.save"].isEnabled)
        app.buttons["perfil.save"].tap()

        XCTAssertTrue(element(app, "perfil.saved").waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["perfil.save"].isEnabled)
    }

    @MainActor
    func testReturnInTheNameSavesItWithoutAddingALine() {
        let app = launch([savedSession])
        openPerfilTab(app)
        let name = element(app, "perfil.nombre")
        XCTAssertTrue(name.waitForExistence(timeout: 10))
        XCTAssertTrue(name.isHittable)

        name.tap()
        name.typeWhenFocused(" Dos\n")

        XCTAssertTrue(element(app, "perfil.saved").waitForExistence(timeout: 10))
        // Where the caret lands is up to the system; what matters is that no line was added.
        let value = name.value as? String ?? ""
        XCTAssertTrue(value.contains("Dos"))
        XCTAssertFalse(value.contains("\n"), "no newline in the field")
    }

    @MainActor
    func testDeletingTheAccountNeedsTheTypedWordAndReturnsToSignInWithANotice() {
        let app = launch([savedSession])
        openPerfilTab(app)
        XCTAssertTrue(app.buttons["perfil.delete"].waitForExistence(timeout: 10))
        app.buttons["perfil.delete"].tap()

        let field = app.textFields["perfil.delete.field"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        let confirm = app.buttons["perfil.delete.confirm"]
        XCTAssertFalse(confirm.isEnabled)
        field.typeWhenFocused("ELIMINA")
        XCTAssertFalse(confirm.isEnabled, "a partial word does not count")
        field.typeWhenFocused("R")
        XCTAssertTrue(confirm.isEnabled)
        confirm.tap()

        XCTAssertTrue(app.buttons["signin.apple"].waitForExistence(timeout: 10))
        XCTAssertEqual(element(app, "signin.notice").label, "Tu cuenta y tus datos se eliminaron")
    }

    @MainActor
    func testDeleteAccountIsReachableAtTheLargestTextSize() {
        let app = launch([savedSession, "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"])
        openPerfilTab(app)
        let delete = app.buttons["perfil.delete"]
        XCTAssertTrue(delete.waitForExistence(timeout: 10))

        // It may start under the tab bar; scrolling must bring it clear of it.
        for _ in 0..<5 where !delete.isHittable { app.swipeUp() }

        XCTAssertTrue(delete.isHittable)
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

    // MARK: Detalle de bucket

    private func openDeseos(_ app: XCUIApplication) {
        let row = element(app, "resumen.bucket.Deseos")
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        let header = element(app, "detalle.header")
        // On the slow CI runner a tap that lands while the Resumen is still settling
        // (its first load re-renders the rows) can be dropped. Tap again once if the
        // detail did not open; a second miss is a real failure.
        for _ in 0..<2 {
            if row.isHittable { row.tap() }
            if header.waitForExistence(timeout: 10) { return }
        }
        XCTFail("Tapping the Deseos row did not open its detail")
    }

    @MainActor
    func testTappingABucketOpensItsMovementsGroupedByCategory() {
        let app = launch([savedSession])
        openDeseos(app)

        // The groups of Deseos, biggest first and «Sin categoría» last, and the month it came from.
        XCTAssertTrue(app.navigationBars["Deseos"].exists)
        XCTAssertEqual(app.staticTexts["detalle.month"].label, "Septiembre de 2026")
        let rest = element(app, "detalle.group.stub-des-rest")
        let susc = element(app, "detalle.group.stub-des-susc")
        let none = element(app, "detalle.group.sin-categoria")
        XCTAssertTrue(rest.exists && susc.exists)
        XCTAssertTrue(rest.label.hasPrefix("Restaurantes. 2 movimientos"), rest.label)
        XCTAssertLessThan(rest.frame.minY, susc.frame.minY)
        for _ in 0..<4 where !none.exists { app.swipeUp() }
        XCTAssertTrue(none.exists, "«Sin categoría» group missing")
        XCTAssertTrue(element(app, "detalle.row.t-d5").exists)
        // The traffic light is hidden in v1: no state label here either.
        for text in ["Muy Saludable", "Saludable", "En peligro", "Estado del mes"] {
            XCTAssertEqual(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", text)).count, 0)
        }
    }

    @MainActor
    func testGoingBackFromTheDetailKeepsTheMonthTheSummaryWasOn() {
        let app = launch([savedSession])
        XCTAssertTrue(app.staticTexts["resumen.month"].waitForExistence(timeout: 10))
        app.buttons["Mes anterior"].tap()
        XCTAssertTrue(app.staticTexts["Agosto de 2026"].waitForExistence(timeout: 10))

        element(app, "resumen.bucket.Deseos").tap()
        XCTAssertTrue(element(app, "detalle.month").waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["detalle.month"].label, "Agosto de 2026")
        XCTAssertTrue(element(app, "detalle.empty").waitForExistence(timeout: 10))
        // The selector stays available in the empty month.
        XCTAssertTrue(app.buttons["Mes siguiente"].isEnabled)
        app.navigationBars.buttons.firstMatch.tap()

        XCTAssertTrue(app.staticTexts["resumen.month"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["resumen.month"].label, "Agosto de 2026")
    }

    @MainActor
    func testMovingAMovementToAnotherCategoryOfTheSameBucketUpdatesTheGroups() {
        let app = launch([savedSession])
        openDeseos(app)

        // Netflix is in Suscripciones; Restaurantes is in the same bucket: no confirmation.
        element(app, "detalle.row.t-d3").tap()
        XCTAssertTrue(element(app, "detalle.sheet").waitForExistence(timeout: 10))
        element(app, "detalle.category.stub-des-rest").tap()

        let announcement = element(app, "detalle.announcement")
        XCTAssertTrue(announcement.waitForExistence(timeout: 10))
        XCTAssertEqual(announcement.label, "Movida a Deseos · Restaurantes")
        XCTAssertFalse(element(app, "detalle.sheet").exists)
        XCTAssertTrue(element(app, "detalle.group.stub-des-rest").label.hasPrefix("Restaurantes. 3 movimientos"))
    }

    @MainActor
    func testMovingToAnotherBucketAsksFirstAndTheSummaryFollows() {
        let app = launch([savedSession])
        openDeseos(app)

        element(app, "detalle.row.t-d5").tap()
        XCTAssertTrue(element(app, "detalle.sheet").waitForExistence(timeout: 10))
        element(app, "detalle.category.stub-nec-super").tap()
        // Another bucket: nothing is sent until the person confirms.
        XCTAssertTrue(app.alerts["Cambiar de grupo"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.alerts.staticTexts["Este movimiento pasará de Deseos a Necesidades y cambiará el cálculo del mes."].exists)
        app.alerts.buttons["Cancelar"].tap()
        XCTAssertTrue(element(app, "detalle.sheet").exists, "cancelling keeps the sheet and the movement")

        element(app, "detalle.category.stub-nec-super").tap()
        XCTAssertTrue(app.alerts["Cambiar de grupo"].waitForExistence(timeout: 10))
        app.alerts.buttons["Confirmar"].tap()

        let announcement = element(app, "detalle.announcement")
        XCTAssertTrue(announcement.waitForExistence(timeout: 10))
        XCTAssertEqual(announcement.label, "Movida a Necesidades · Supermercado")
        XCTAssertFalse(element(app, "detalle.row.t-d5").exists, "the movement left Deseos")
        app.navigationBars.buttons.firstMatch.tap()

        // Deseos was $610.400 and the moved movement was $384.020.
        let deseos = element(app, "resumen.bucket.Deseos")
        expectation(for: NSPredicate(format: "label CONTAINS %@", "$226.380"), evaluatedWith: deseos)
        waitForExpectations(timeout: 10)
    }

    @MainActor
    func testCreatingACategoryFromTheSheetMovesTheMovementIntoIt() {
        let app = launch([savedSession])
        openDeseos(app)
        element(app, "detalle.row.t-d5").tap()
        XCTAssertTrue(element(app, "detalle.sheet").waitForExistence(timeout: 10))

        element(app, "detalle.create").tap()
        let name = element(app, "category.name")
        XCTAssertTrue(name.waitForExistence(timeout: 10))
        // No pattern field here: patterns are added later from the category.
        XCTAssertFalse(element(app, "category.pattern").exists)
        name.tap()
        name.typeWhenFocused("Ropa")
        element(app, "category.bucket.Deseos").tap()
        app.buttons["category.save"].tap()

        let announcement = element(app, "detalle.announcement")
        XCTAssertTrue(announcement.waitForExistence(timeout: 10))
        XCTAssertEqual(announcement.label, "Movida a Deseos · Ropa")
        XCTAssertTrue(element(app, "detalle.group.stub-new-1").exists)
    }

    @MainActor
    func testAtTheLargestTextSizeTheFirstMovementIsReachable() {
        let app = launch([savedSession, "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"])
        let row = element(app, "resumen.bucket.Deseos")
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        for _ in 0..<6 where !row.isHittable { app.swipeUp() }
        row.tap()
        XCTAssertTrue(element(app, "detalle.header").waitForExistence(timeout: 10))

        // The first movement of the first group (Restaurantes, biggest amount first).
        let first = element(app, "detalle.row.t-d1")
        var swipes = 0
        while !first.isHittable && swipes < 3 {
            app.swipeUp()
            swipes += 1
        }
        XCTAssertTrue(first.isHittable, "first movement not reachable within 3 swipes at the largest text size")
        first.tap()
        XCTAssertTrue(element(app, "detalle.sheet").waitForExistence(timeout: 10))
    }

    // MARK: Ingresos del mes

    @MainActor
    func testTappingTheIncomeCardOpensThatMonthsIncomes() {
        let app = launch([savedSession])
        let card = element(app, "resumen.ingreso")
        XCTAssertTrue(card.waitForExistence(timeout: 10))
        card.tap()

        XCTAssertTrue(element(app, "ingresos.header").waitForExistence(timeout: 10))
        XCTAssertTrue(app.navigationBars["Ingresos"].exists)
        XCTAssertEqual(app.staticTexts["ingresos.month"].label, "Septiembre de 2026")
        // Total and count of the month, then every income with its origin; VoiceOver reads the sign.
        XCTAssertEqual(element(app, "ingresos.header").label, "Ingreso. Ingreso de $1.850.000. 4 movimientos")
        let salary = element(app, "ingresos.row.i-s1")
        XCTAssertTrue(salary.exists)
        XCTAssertTrue(salary.label.contains("Ingreso de $1.650.000"), salary.label)
        XCTAssertTrue(salary.label.hasSuffix("Banco de Chile"), salary.label)
        XCTAssertTrue(element(app, "ingresos.row.i-s3").label.hasSuffix("Manual"))
        // Read-only: no traffic light and no spend wording here either.
        XCTAssertEqual(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Gasto")).count, 0)

        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(app.staticTexts["resumen.month"].waitForExistence(timeout: 10))
    }

    @MainActor
    func testTheIncomesOpenForTheMonthTheSummaryWasOnAndTheSelectorReachesAnEmptyMonth() {
        let app = launch([savedSession])
        XCTAssertTrue(app.staticTexts["resumen.month"].waitForExistence(timeout: 10))
        app.buttons["Mes anterior"].tap()
        XCTAssertTrue(app.staticTexts["Agosto de 2026"].waitForExistence(timeout: 10))

        element(app, "resumen.ingreso").tap()
        XCTAssertTrue(element(app, "ingresos.header").waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["ingresos.month"].label, "Agosto de 2026")
        XCTAssertTrue(element(app, "ingresos.row.i-a1").exists)
        XCTAssertFalse(element(app, "ingresos.row.i-s1").exists, "September's income showed up in August")

        app.buttons["Mes anterior"].tap()
        let empty = element(app, "ingresos.empty")
        XCTAssertTrue(empty.waitForExistence(timeout: 10))
        XCTAssertTrue(empty.label.contains("Sin ingresos en julio de 2026"), empty.label)
        XCTAssertTrue(app.buttons["Mes siguiente"].isEnabled)
    }

    @MainActor
    func testAtTheLargestTextSizeTheFirstIncomeIsReachable() {
        let app = launch([savedSession, "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"])
        let card = element(app, "resumen.ingreso")
        XCTAssertTrue(card.waitForExistence(timeout: 10))
        for _ in 0..<6 where !card.isHittable { app.swipeUp() }
        card.tap()
        XCTAssertTrue(element(app, "ingresos.header").waitForExistence(timeout: 10))

        let first = element(app, "ingresos.row.i-s1")
        var swipes = 0
        while !first.isHittable && swipes < 3 {
            app.swipeUp()
            swipes += 1
        }
        XCTAssertTrue(first.isHittable, "first income not reachable within 3 swipes at the largest text size")
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

        field.typeWhenFocused("mala")
        app.buttons["subir.retry"].tap()
        XCTAssertTrue(app.staticTexts["La contraseña es incorrecta. Inténtalo de nuevo."].waitForExistence(timeout: 10))

        field.tap()
        field.typeWhenFocused("correcta")
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
        name.typeWhenFocused("Amigos\n")
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
        name.typeWhenFocused("Supermercado\n")
        app.buttons["category.bucket.Deseos"].tap()
        app.buttons["category.save"].tap()

        XCTAssertTrue(element(app, "category.error.name").waitForExistence(timeout: 5))
        XCTAssertEqual(element(app, "category.error.name").label, "Ya tienes una categoría con ese nombre")
        XCTAssertEqual(name.value as? String, "Supermercado")
    }
}

extension XCUIElement {
    /// Types only once the field really has keyboard focus. On the slow CI runner a
    /// `typeText` right after `tap()` can run before the keyboard attaches and fail with
    /// "Neither element nor any descendant has keyboard focus".
    func typeWhenFocused(_ text: String, file: StaticString = #filePath, line: UInt = #line) {
        for _ in 0..<3 {
            if (value(forKey: "hasKeyboardFocus") as? Bool) == true { break }
            tap()
            let deadline = Date().addingTimeInterval(3)
            while Date() < deadline, (value(forKey: "hasKeyboardFocus") as? Bool) != true {
                RunLoop.current.run(until: Date().addingTimeInterval(0.1))
            }
        }
        XCTAssertEqual(value(forKey: "hasKeyboardFocus") as? Bool, true,
                       "the field never got keyboard focus", file: file, line: line)
        typeText(text)
    }
}
