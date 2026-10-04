import Foundation
import HTTPTypes
import OpenAPIRuntime

/// What screens need from the API. Screens depend on this protocol, never on
/// the generated types, so a spec change is absorbed here and tests can use a fake.
protocol MirachAPI: Sendable {
    /// Public `GET /version`: the deployed build of the API.
    func version() async throws -> VersionInfo
}

enum APIError: Error, Equatable {
    /// The server answered with a status the spec does not document (e.g. 503).
    case badStatus(Int)
}

/// `MirachAPI` backed by the generated OpenAPI client.
struct OpenAPIMirachAPI: MirachAPI {
    private let client: Client

    init(
        serverURL: URL,
        transport: any ClientTransport,
        middlewares: [any ClientMiddleware] = []
    ) {
        client = Client(serverURL: serverURL, transport: transport, middlewares: middlewares)
    }

    func version() async throws -> VersionInfo {
        do {
            let output = try await client.get_sol_version()
            switch output {
            case .ok(let ok):
                let body = try ok.body.json
                return VersionInfo(version: body.version, commit: body.commit)
            case .undocumented(let statusCode, _):
                throw APIError.badStatus(statusCode)
            }
        } catch let error as ClientError {
            // The generated client wraps everything in ClientError; screens map the real cause.
            throw error.underlyingError
        }
    }
}
