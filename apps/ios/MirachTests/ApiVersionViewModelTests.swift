import Foundation
import Testing
@testable import Mirach

private struct FakeHTTPClient: HTTPClient {
    let result: Result<Data, any Error>
    func get(_ url: URL) async throws -> Data { try result.get() }
}

@MainActor
struct ApiVersionViewModelTests {
    private func makeViewModel(_ result: Result<Data, any Error>) -> ApiVersionViewModel {
        ApiVersionViewModel(client: FakeHTTPClient(result: result))
    }

    @Test func startsIdle() {
        #expect(makeViewModel(.success(Data())).state == .idle)
    }

    @Test func loadsVersionAndCommit() async {
        let body = Data(#"{"version":"1.2.3","commit":"abc1234","extra":true}"#.utf8)
        let viewModel = makeViewModel(.success(body))

        await viewModel.load()

        #expect(viewModel.state == .loaded(VersionInfo(version: "1.2.3", commit: "abc1234")))
    }

    @Test func reportsNetworkFailure() async {
        let viewModel = makeViewModel(.failure(URLError(.notConnectedToInternet)))

        await viewModel.load()

        guard case .failed(let message) = viewModel.state else {
            Issue.record("expected .failed, got \(viewModel.state)")
            return
        }
        #expect(message.contains("conectar"))
    }

    @Test func reportsTimeoutWithDedicatedMessage() async {
        let viewModel = makeViewModel(.failure(URLError(.timedOut)))

        await viewModel.load()

        guard case .failed(let message) = viewModel.state else {
            Issue.record("expected .failed, got \(viewModel.state)")
            return
        }
        #expect(message.contains("tardó"))
    }

    @Test func reportsBadStatus() async {
        let viewModel = makeViewModel(.failure(HTTPError.badStatus(503)))

        await viewModel.load()

        #expect({ if case .failed = viewModel.state { true } else { false } }())
    }

    @Test func reportsDecodingFailure() async {
        let viewModel = makeViewModel(.success(Data(#"{"unexpected":1}"#.utf8)))

        await viewModel.load()

        #expect(viewModel.state == .failed("La respuesta del servidor no tiene el formato esperado."))
    }
}
