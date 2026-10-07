import Foundation
import HTTPTypes
import Testing
@testable import Mirach

private let saved = Session(
    token: "tok-123", userId: "u-1", expiresAt: Date(timeIntervalSince1970: 1_800_000_000)
)

@MainActor
struct AppEnvironmentTests {
    // MARK: API key detection (prerequisite b)

    @Test func emptyOrBlankApiKeyIsAProblem() {
        #expect(ConfigurationCheck.problem(apiKey: "") == .missingAPIKey)
        #expect(ConfigurationCheck.problem(apiKey: "   \n") == .missingAPIKey)
    }

    @Test func aPresentApiKeyIsNotAProblem() {
        #expect(ConfigurationCheck.problem(apiKey: "some-key") == nil)
    }

    @Test func environmentReportsTheMissingKeyWithoutCrashing() {
        let live = AppEnvironment.make(arguments: [], apiKey: "", store: InMemorySessionStore())
        #expect(live.configurationProblem == .missingAPIKey)
    }

    @Test func environmentWithAKeyHasNoProblem() {
        let live = AppEnvironment.make(arguments: [], apiKey: "k", store: InMemorySessionStore())
        #expect(live.configurationProblem == nil)
    }

    @Test func stubbedLaunchIgnoresTheKeyUnlessAskedToSimulateItMissing() {
        let stubbed = AppEnvironment.make(arguments: [AppEnvironment.stubbedClientArgument], apiKey: "")
        #expect(stubbed.configurationProblem == nil)

        let missing = AppEnvironment.make(
            arguments: [AppEnvironment.stubbedClientArgument, AppEnvironment.missingAPIKeyArgument],
            apiKey: "k"
        )
        #expect(missing.configurationProblem == .missingAPIKey)
    }

    // MARK: stubbed sessions for UI tests

    @Test func stubbedLaunchHasNoSessionUnlessAskedFor() {
        let none = AppEnvironment.make(arguments: [AppEnvironment.stubbedClientArgument])
        let some = AppEnvironment.make(
            arguments: [AppEnvironment.stubbedClientArgument, AppEnvironment.savedSessionArgument]
        )
        #expect(none.store.load() == nil)
        #expect(some.store.load() != nil)
    }

    // MARK: ending the session drops the staged statement

    @Test func endingTheSessionDiscardsTheStagedStatementAndItsPassword() async {
        for ending in [
            { (live: AppEnvironment.Dependencies) in live.session.signOut() },
            { (live: AppEnvironment.Dependencies) in live.session.accountDeleted() },
        ] {
            let staging = FakeCartolaStaging()
            let live = AppEnvironment.make(
                arguments: [AppEnvironment.stubbedClientArgument, AppEnvironment.savedSessionArgument],
                staging: staging
            )
            await live.subir.chooseFile(URL(fileURLWithPath: "/tmp/cartola.xlsx"))
            #expect(staging.discarded.isEmpty)

            ending(live)

            #expect(staging.discarded.map(\.filename) == ["cartola.xlsx"])
        }
    }

    // MARK: 401 handling, wired end to end

    @Test func a401OnAnAuthenticatedCallDiscardsTheSessionAndReturnsToSignIn() async throws {
        let store = InMemorySessionStore()
        let transport = FakeTransport.json(
            #"{"message":"x","code":"SESION_INVALIDA"}"#, status: .unauthorized
        )
        let environment = AppEnvironment.make(arguments: [], apiKey: "key", store: store, transport: transport)
        try environment.session.signIn(saved)

        _ = try? await environment.api.currentUser()
        await environment.expiryRelay.waitForDelivery()

        // The saved token travelled as the Bearer header (middleware reads the store)...
        #expect(transport.requests.first?.headerFields[.authorization] == "Bearer tok-123")
        // ...and the rejection cleared it, with no retry.
        #expect(store.load() == nil)
        #expect(environment.session.phase == .signedOut)
        #expect(transport.requests.count == 1)
    }

    @Test func aLate401ForAnOldTokenDoesNotSignOutANewerSession() async throws {
        let store = InMemorySessionStore()
        let newer = Session(token: "tok-NEW", userId: "u-1", expiresAt: saved.expiresAt)
        // While the request is in flight the person signs in again; then the old 401 arrives.
        let transport = FakeTransport { _ in
            try? store.save(newer)
            var response = HTTPResponse(status: .unauthorized)
            response.headerFields[.contentType] = "application/json"
            return (response, #"{"message":"x","code":"SESION_INVALIDA"}"#)
        }
        let environment = AppEnvironment.make(arguments: [], apiKey: "key", store: store, transport: transport)
        try environment.session.signIn(saved)

        _ = try? await environment.api.currentUser()
        await environment.expiryRelay.waitForDelivery()

        #expect(store.load() == newer)
        #expect(environment.session.phase == .signedIn(userId: "u-1"))
    }

    @Test func aRejectedApiKeyDoesNotDiscardTheSession() async throws {
        let store = InMemorySessionStore()
        let transport = FakeTransport.json(
            #"{"message":"x","code":"API_KEY_INVALIDA"}"#, status: .unauthorized
        )
        let environment = AppEnvironment.make(arguments: [], apiKey: "key", store: store, transport: transport)
        try environment.session.signIn(saved)

        _ = try? await environment.api.currentUser()
        await environment.expiryRelay.waitForDelivery()

        #expect(store.load() == saved)
    }

    // MARK: staged statements

    @Test func launchPurgesStatementsLeftByAPreviousRunExactlyOnce() {
        let staging = FakeCartolaStaging()

        _ = AppEnvironment.make(arguments: [AppEnvironment.stubbedClientArgument], staging: staging)

        #expect(staging.purges == 1)
    }

    @Test func liveLaunchAlsoPurgesAndSharesTheStagingWithTheFlow() {
        let staging = FakeCartolaStaging()

        let live = AppEnvironment.make(arguments: [], apiKey: "k", store: InMemorySessionStore(), staging: staging)

        #expect(staging.purges == 1)
        #expect(live.staging as AnyObject === staging)
    }
}
