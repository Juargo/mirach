import Foundation
import Testing
@testable import Mirach

private struct FakeMirachAPI: MirachAPI {
    let result: Result<VersionInfo, any Error>
    func version() async throws -> VersionInfo { try result.get() }
}

@MainActor
struct ApiVersionViewModelTests {
    private func makeViewModel(_ result: Result<VersionInfo, any Error>) -> ApiVersionViewModel {
        ApiVersionViewModel(api: FakeMirachAPI(result: result))
    }

    private let sample = VersionInfo(version: "1.2.3", commit: "abc1234")

    @Test func startsIdle() {
        #expect(makeViewModel(.success(sample)).state == .idle)
    }

    @Test func loadsVersionAndCommit() async {
        let viewModel = makeViewModel(.success(sample))

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
        #expect(message == "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.")
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
        let viewModel = makeViewModel(.failure(APIError.badStatus(503)))

        await viewModel.load()

        #expect(viewModel.state == .failed(
            "El servidor no está disponible en este momento. Intenta de nuevo en unos segundos."
        ))
    }

    @Test func treatsCancellationErrorAsCancellation() async {
        let viewModel = makeViewModel(.failure(CancellationError()))

        await viewModel.load()

        #expect(viewModel.state == .idle)
    }

    @Test func treatsURLErrorCancelledAsCancellation() async {
        let viewModel = makeViewModel(.failure(URLError(.cancelled)))

        await viewModel.load()

        #expect(viewModel.state == .idle)
    }

    @Test func reportsDecodingFailure() async {
        let viewModel = makeViewModel(.failure(DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "test"))))

        await viewModel.load()

        #expect(viewModel.state == .failed("La respuesta del servidor no tiene el formato esperado."))
    }
}
