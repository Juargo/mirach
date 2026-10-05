import Foundation
import HTTPTypes
import OpenAPIRuntime

/// Fake `ClientTransport`: lets tests drive the real generated client with a
/// canned response (or error) and inspect the request it produced.
final class FakeTransport: ClientTransport, @unchecked Sendable {
    private let lock = NSLock()
    private var _requests: [HTTPRequest] = []
    private var _bodies: [String] = []
    private let respond: @Sendable (HTTPRequest) throws -> (HTTPResponse, String?)

    init(respond: @escaping @Sendable (HTTPRequest) throws -> (HTTPResponse, String?)) {
        self.respond = respond
    }

    static func json(_ body: String, status: HTTPResponse.Status = .ok) -> FakeTransport {
        FakeTransport { _ in
            var response = HTTPResponse(status: status)
            response.headerFields[.contentType] = "application/json"
            return (response, body)
        }
    }

    static func failing(_ error: any Error) -> FakeTransport {
        FakeTransport { _ in throw error }
    }

    var requests: [HTTPRequest] { lock.withLock { _requests } }
    /// The request bodies as text, in the same order as `requests` ("" when there was none).
    var bodies: [String] { lock.withLock { _bodies } }

    func send(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var sent = ""
        if let body { sent = try await String(collecting: body, upTo: 1_048_576) }
        lock.withLock {
            _requests.append(request)
            _bodies.append(sent)
        }
        let (response, text) = try respond(request)
        return (response, text.map { HTTPBody($0) })
    }
}
