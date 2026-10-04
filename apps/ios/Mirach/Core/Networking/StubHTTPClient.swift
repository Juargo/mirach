import Foundation

/// Canned client used by UI tests (see `AppEnvironment`). Lives in the app
/// target because XCUITest runs the app as a separate process and can only
/// influence it through launch arguments.
struct StubHTTPClient: HTTPClient {
    let data: Data

    func get(_ url: URL) async throws -> Data { data }

    static let version = StubHTTPClient(
        data: Data(#"{"version":"0.0.0-stub","commit":"stub123"}"#.utf8)
    )
}
