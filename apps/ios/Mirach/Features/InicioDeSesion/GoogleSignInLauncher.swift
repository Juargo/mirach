/// What Google's sheet answered. Only the ID token leaves it; the API verifies it.
enum GoogleSignInResult: Equatable, Sendable {
    case success(idToken: String)
    /// The person closed the sheet: not an error.
    case cancelled
    /// Anything else (network, Google, configuration).
    case failed
}

/// Opens Google's sign-in sheet. The view model depends on this, never on the SDK, so tests
/// can stand in for Google.
@MainActor
protocol GoogleSignInLauncher: AnyObject {
    func requestIdToken() async -> GoogleSignInResult
}
