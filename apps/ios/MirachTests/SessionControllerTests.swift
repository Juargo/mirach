import Foundation
import Testing
@testable import Mirach

private let saved = Session(
    token: "tok-123", userId: "u-1", expiresAt: Date(timeIntervalSince1970: 1_800_000_000)
)

@MainActor
struct SessionControllerTests {
    private func makeController(
        store: any SessionStore,
        api: FakeMirachAPI = FakeMirachAPI()
    ) -> SessionController {
        SessionController(api: api, store: store)
    }

    // MARK: startup routing

    @Test func startsValidating() {
        #expect(makeController(store: InMemorySessionStore()).phase == .validating)
    }

    @Test func withoutSavedSessionGoesToSignInWithoutCallingTheAPI() async {
        let api = FakeMirachAPI()
        let controller = makeController(store: InMemorySessionStore(), api: api)

        await controller.start()

        #expect(controller.phase == .signedOut)
        #expect(api.currentUserCalls == 0)
    }

    @Test func savedSessionAcceptedByTheServerGoesToTheSignedInArea() async {
        let api = FakeMirachAPI(currentUserResult: .success(CurrentUser(userId: "u-1", nombre: "Ana")))
        let controller = makeController(store: InMemorySessionStore(session: saved), api: api)

        await controller.start()

        #expect(controller.phase == .signedIn(userId: "u-1"))
        #expect(api.currentUserCalls == 1)
    }

    @Test func savedSessionRejectedByTheServerIsClearedAndGoesToSignIn() async {
        let store = InMemorySessionStore(session: saved)
        let api = FakeMirachAPI(currentUserResult: .failure(APIError.sessionExpired))
        let controller = makeController(store: store, api: api)

        await controller.start()

        #expect(controller.phase == .signedOut)
        #expect(store.load() == nil)
    }

    @Test func networkFailureKeepsTheSessionAndOffersRetry() async {
        let failures: [any Error] = [
            URLError(.notConnectedToInternet), URLError(.timedOut), APIError.badStatus(503),
        ]
        for failure in failures {
            let store = InMemorySessionStore(session: saved)
            let controller = makeController(
                store: store, api: FakeMirachAPI(currentUserResult: .failure(failure))
            )

            await controller.start()

            #expect(controller.phase == .connectionFailed, "\(failure)")
            #expect(store.load() == saved, "a flaky network must not sign the person out")
        }
    }

    @Test func retryAfterANetworkFailureCanSucceed() async {
        let api = FakeMirachAPI(currentUserResult: .failure(URLError(.notConnectedToInternet)))
        let controller = makeController(store: InMemorySessionStore(session: saved), api: api)
        await controller.start()
        #expect(controller.phase == .connectionFailed)

        api.setCurrentUserResult(.success(CurrentUser(userId: "u-1", nombre: "Ana")))
        await controller.start()

        #expect(controller.phase == .signedIn(userId: "u-1"))
    }

    @Test func rejectedApiKeyIsAConfigurationProblemAndKeepsTheSession() async {
        let store = InMemorySessionStore(session: saved)
        let api = FakeMirachAPI(currentUserResult: .failure(APIError.apiKeyRejected))
        let controller = makeController(store: store, api: api)

        await controller.start()

        #expect(controller.phase == .misconfigured)
        #expect(store.load() == saved)
    }

    @Test func cancelledValidationChangesNothing() async {
        let api = FakeMirachAPI(currentUserResult: .failure(URLError(.cancelled)))
        let controller = makeController(store: InMemorySessionStore(session: saved), api: api)

        await controller.start()

        #expect(controller.phase == .validating)
    }

    // MARK: sign in, sign out, expiry

    @Test func signInSavesTheSessionAndOpensTheSignedInArea() throws {
        let store = InMemorySessionStore()
        let controller = makeController(store: store)

        try controller.signIn(saved)

        #expect(store.load() == saved)
        #expect(controller.phase == .signedIn(userId: "u-1"))
    }

    @Test func signInThatCannotBeSavedThrowsAndStaysSignedOut() async {
        let controller = makeController(store: FailingSessionStore())
        await controller.start()

        #expect(throws: KeychainSessionStore.KeychainError.self) {
            try controller.signIn(saved)
        }

        #expect(controller.phase == .signedOut)
    }

    @Test func signOutClearsTheSession() throws {
        let store = InMemorySessionStore(session: saved)
        let controller = makeController(store: store)
        try controller.signIn(saved)

        controller.signOut()

        #expect(store.load() == nil)
        #expect(controller.phase == .signedOut)
    }

    @Test func anExpiredSessionNotificationClearsItAndReturnsToSignIn() throws {
        let store = InMemorySessionStore(session: saved)
        let controller = makeController(store: store)
        try controller.signIn(saved)

        controller.sessionExpired(token: saved.token)

        #expect(store.load() == nil)
        #expect(controller.phase == .signedOut)
    }

    @Test func aStaleExpiryForAnOldTokenDoesNotSignOutTheNewSession() throws {
        let store = InMemorySessionStore()
        let controller = makeController(store: store)
        try controller.signIn(saved)
        let newer = Session(token: "tok-NEW", userId: "u-1", expiresAt: saved.expiresAt)
        try controller.signIn(newer)

        controller.sessionExpired(token: saved.token) // a late 401 for the old token

        #expect(store.load() == newer)
        #expect(controller.phase == .signedIn(userId: "u-1"))
    }

    @Test func startupRejectionClearsTheSessionExactlyOnceEvenIfTheRelayDeliversToo() async {
        let store = CountingSessionStore(session: saved)
        let api = FakeMirachAPI(currentUserResult: .failure(APIError.sessionExpired))
        let controller = makeController(store: store, api: api)

        await controller.start()
        controller.sessionExpired(token: saved.token) // the relay's later delivery

        #expect(store.clears == 1)
        #expect(controller.phase == .signedOut)
    }

    @Test func signOutStillShowsSignedOutWhenTheKeychainDeleteFails() {
        let controller = makeController(store: UndeletableSessionStore(session: saved))

        controller.signOut()

        #expect(controller.phase == .signedOut)
    }

    @Test func relayDeliversTheExpiryToTheControllerOnTheMainActor() async throws {
        let store = InMemorySessionStore(session: saved)
        let controller = makeController(store: store)
        try controller.signIn(saved)
        let relay = SessionExpiryRelay()
        relay.connect { token in await controller.sessionExpired(token: token) }

        relay.fire(token: saved.token) // what the API adapter calls, from any thread
        await relay.waitForDelivery()

        #expect(controller.phase == .signedOut)
        #expect(store.load() == nil)
    }

    @Test func relayWithoutAReceiverIsHarmless() {
        SessionExpiryRelay().fire(token: "x")
    }
}
