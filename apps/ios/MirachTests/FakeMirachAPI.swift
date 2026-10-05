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
    private var _capabilitiesCalls = 0

    private let versionResult: Result<VersionInfo, any Error>
    private var capabilitiesResult: Result<AuthCapabilities, any Error>
    private let signInResult: Result<Session, any Error>
    private var currentUserResult: Result<CurrentUser, any Error>
    private var resumenResult: Result<ResumenMes, any Error>
    private var periodosResult: Result<[Periodo], any Error>
    private var _resumenCalls: [Periodo?] = []

    init(
        versionResult: Result<VersionInfo, any Error> = .success(VersionInfo(version: "0", commit: "0")),
        capabilitiesResult: Result<AuthCapabilities, any Error> = .success(AuthCapabilities(appleLoginEnabled: true)),
        signInResult: Result<Session, any Error> = .success(
            Session(token: "tok", userId: "u-1", expiresAt: Date(timeIntervalSince1970: 1_800_000_000))
        ),
        currentUserResult: Result<CurrentUser, any Error> = .success(CurrentUser(userId: "u-1", nombre: "Ana")),
        resumenResult: Result<ResumenMes, any Error> = .success(SampleData.septiembre),
        periodosResult: Result<[Periodo], any Error> = .success([])
    ) {
        self.resumenResult = resumenResult
        self.periodosResult = periodosResult
        self.versionResult = versionResult
        self.capabilitiesResult = capabilitiesResult
        self.signInResult = signInResult
        self.currentUserResult = currentUserResult
    }

    var signInCalls: [SignInCall] { lock.withLock { _signInCalls } }
    var currentUserCalls: Int { lock.withLock { _currentUserCalls } }
    var capabilitiesCalls: Int { lock.withLock { _capabilitiesCalls } }

    func setCapabilitiesResult(_ result: Result<AuthCapabilities, any Error>) {
        lock.withLock { capabilitiesResult = result }
    }

    /// Lets a test change what the next `currentUser()` returns (e.g. retry after a network failure).
    func setCurrentUserResult(_ result: Result<CurrentUser, any Error>) {
        lock.withLock { currentUserResult = result }
    }

    /// The periods each `resumen(periodo:)` call asked for, in order (`nil` = API default).
    var resumenCalls: [Periodo?] { lock.withLock { _resumenCalls } }

    func setResumenResult(_ result: Result<ResumenMes, any Error>) {
        lock.withLock { resumenResult = result }
    }

    func setPeriodosResult(_ result: Result<[Periodo], any Error>) {
        lock.withLock { periodosResult = result }
    }

    func resumen(periodo: Periodo?) async throws -> ResumenMes {
        let result = lock.withLock {
            _resumenCalls.append(periodo)
            return resumenResult
        }
        return try result.get()
    }

    func periodos() async throws -> [Periodo] {
        try lock.withLock { periodosResult }.get()
    }

    func version() async throws -> VersionInfo { try versionResult.get() }
    func authCapabilities() async throws -> AuthCapabilities {
        let result = lock.withLock {
            _capabilitiesCalls += 1
            return capabilitiesResult
        }
        return try result.get()
    }

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
