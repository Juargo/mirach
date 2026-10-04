import Foundation

/// Minimal HTTP seam. View models depend on this protocol, so tests and UI
/// tests can swap the network for a fake.
protocol HTTPClient: Sendable {
    /// Performs a GET and returns the body of a 2xx response.
    func get(_ url: URL) async throws -> Data
}

enum HTTPError: Error, Equatable {
    case invalidResponse
    case badStatus(Int)
}

struct URLSessionHTTPClient: HTTPClient {
    private let session: URLSession

    init(timeout: TimeInterval = AppConfiguration.requestTimeout) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = timeout
        session = URLSession(configuration: configuration)
    }

    func get(_ url: URL) async throws -> Data {
        let (data, response) = try await session.data(from: url)
        guard let http = response as? HTTPURLResponse else {
            throw HTTPError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            throw HTTPError.badStatus(http.statusCode)
        }
        return data
    }
}
