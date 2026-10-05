import Foundation
@testable import Mirach

/// Programmable `MirachAPI` for view model and session tests. Records sign-in calls.
final class FakeMirachAPI: MirachAPI, @unchecked Sendable {
    struct SignInCall: Equatable {
        let identityToken: String
        let nonce: String
        let nombre: String?
    }

    private let lock = NSLock()
    private var _signInCalls: [SignInCall] = []
    private var _currentUserCalls = 0

    private let versionResult: Result<VersionInfo, any Error>
    private let capabilitiesResult: Result<AuthCapabilities, any Error>
    private let signInResult: Result<Session, any Error>
    private var currentUserResult: Result<CurrentUser, any Error>

    init(
        versionResult: Result<VersionInfo, any Error> = .success(VersionInfo(version: "0", commit: "0")),
        capabilitiesResult: Result<AuthCapabilities, any Error> = .success(AuthCapabilities(appleLoginEnabled: true)),
        signInResult: Result<Session, any Error> = .success(
            Session(token: "tok", userId: "u-1", expiresAt: Date(timeIntervalSince1970: 1_800_000_000))
        ),
        currentUserResult: Result<CurrentUser, any Error> = .success(CurrentUser(userId: "u-1", nombre: "Ana"))
    ) {
        self.versionResult = versionResult
        self.capabilitiesResult = capabilitiesResult
        self.signInResult = signInResult
        self.currentUserResult = currentUserResult
    }

    var signInCalls: [SignInCall] { lock.withLock { _signInCalls } }
    var currentUserCalls: Int { lock.withLock { _currentUserCalls } }

    /// Lets a test change what the next `currentUser()` returns (e.g. retry after a network failure).
    func setCurrentUserResult(_ result: Result<CurrentUser, any Error>) {
        lock.withLock { currentUserResult = result }
    }

    func version() async throws -> VersionInfo { try versionResult.get() }
    func authCapabilities() async throws -> AuthCapabilities { try capabilitiesResult.get() }

    func signInWithApple(identityToken: String, nonce: String, nombre: String?) async throws -> Session {
        lock.withLock { _signInCalls.append(SignInCall(identityToken: identityToken, nonce: nonce, nombre: nombre)) }
        return try signInResult.get()
    }

    func currentUser() async throws -> CurrentUser {
        let result = lock.withLock {
            _currentUserCalls += 1
            return currentUserResult
        }
        return try result.get()
    }
}
