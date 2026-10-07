import Foundation
import Testing
@testable import Mirach

private let saved = Session(
    token: "tok-123", userId: "u-1", expiresAt: Date(timeIntervalSince1970: 1_800_000_000)
)

/// Every way a session ends: logout with the server, account deletion, 401.
@MainActor
struct SessionEndTests {
    private func signedInController(
        api: FakeMirachAPI = FakeMirachAPI(), store: InMemorySessionStore? = nil
    ) async -> (SessionController, InMemorySessionStore) {
        let store = store ?? InMemorySessionStore(session: saved)
        let controller = SessionController(api: api, store: store)
        await controller.start()
        return (controller, store)
    }

    /// Counts how many times the controller reported that the session ended.
    private final class Ended: @unchecked Sendable {
        private let lock = NSLock()
        private var _count = 0
        func hit() { lock.withLock { _count += 1 } }
        var count: Int { lock.withLock { _count } }
    }

    // MARK: logout

    @Test func logoutCallsTheServerBeforeClearingTheTokenThenSignsOut() async {
        let api = FakeMirachAPI()
        let store = InMemorySessionStore(session: saved)
        let tokenSeenByTheCall = TokenBox()
        api.setOnLogout { tokenSeenByTheCall.value = store.load()?.token }
        let (controller, _) = await signedInController(api: api, store: store)

        await controller.signOutRemotely()

        #expect(api.logoutCalls == 1)
        #expect(tokenSeenByTheCall.value == "tok-123", "the request still carried the session")
        #expect(store.load() == nil)
        #expect(controller.phase == .signedOut)
    }

    private final class TokenBox: @unchecked Sendable {
        private let lock = NSLock()
        private var _value: String?
        var value: String? {
            get { lock.withLock { _value } }
            set { lock.withLock { _value = newValue } }
        }
    }

    @Test func aFailedLogoutStillSignsOutLocallyWithoutAnError() async {
        let failures: [any Error] = [URLError(.notConnectedToInternet), APIError.badStatus(503), APIError.apiKeyRejected]
        for failure in failures {
            let api = FakeMirachAPI()
            api.setLogoutResult(.failure(failure))
            let (controller, store) = await signedInController(api: api)

            await controller.signOutRemotely()

            #expect(api.logoutCalls == 1)
            #expect(store.load() == nil, "\(failure)")
            #expect(controller.phase == .signedOut, "\(failure)")
        }
    }

    @Test func aSlowLogoutDoesNotKeepThePersonWaiting() async {
        let api = FakeMirachAPI()
        api.setLogoutDelay(.seconds(60))
        let (controller, store) = await signedInController(api: api)
        let started = ContinuousClock.now

        await controller.signOutRemotely(timeout: .milliseconds(50))

        #expect(ContinuousClock.now - started < .seconds(5))
        #expect(store.load() == nil)
        #expect(controller.phase == .signedOut)
    }

    // MARK: account deletion

    @Test func aDeletedAccountClearsTheSessionAndLeavesANoticeForSignIn() async {
        let (controller, store) = await signedInController()

        controller.accountDeleted()

        #expect(store.load() == nil)
        #expect(controller.phase == .signedOut)
        #expect(controller.signedOutNotice == .accountDeleted)
    }

    @Test func theNoticeDisappearsWithTheNextSignIn() async throws {
        let (controller, _) = await signedInController()
        controller.accountDeleted()

        try controller.signIn(saved)

        #expect(controller.signedOutNotice == nil)
    }

    @Test func aPlainSignOutLeavesNoNotice() async {
        let (controller, _) = await signedInController()
        controller.signOut()
        #expect(controller.signedOutNotice == nil)
    }

    // MARK: local cleanup hook (staged statement, password)

    @Test func everyWayOfEndingTheSessionRunsTheCleanup() async {
        let ended = Ended()
        let (controller, _) = await signedInController()
        controller.onSessionEnded = { ended.hit() }

        controller.signOut()
        #expect(ended.count == 1)

        try? controller.signIn(saved)
        controller.accountDeleted()
        #expect(ended.count == 2)

        try? controller.signIn(saved)
        controller.sessionExpired(token: "tok-123")
        #expect(ended.count == 3)

        try? controller.signIn(saved)
        await controller.signOutRemotely()
        #expect(ended.count == 4)
    }
}
