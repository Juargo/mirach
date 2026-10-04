import Foundation
import Observation

/// TEMPORARY: proves networking end to end. Replaced by the real first screen.
@MainActor
@Observable
final class ApiVersionViewModel {
    enum State: Equatable {
        case idle
        case loading
        case loaded(VersionInfo)
        case failed(String)
    }

    private(set) var state: State = .idle

    private let client: any HTTPClient
    private let versionURL: URL

    init(client: any HTTPClient, baseURL: URL = AppConfiguration.apiBaseURL) {
        self.client = client
        self.versionURL = baseURL.appending(path: "version")
    }

    func load() async {
        state = .loading
        do {
            let data = try await client.get(versionURL)
            state = .loaded(try JSONDecoder().decode(VersionInfo.self, from: data))
        } catch is CancellationError {
            state = .idle
        } catch let error as URLError where error.code == .cancelled {
            // URLSession reports a cancelled task as URLError(.cancelled), not CancellationError.
            state = .idle
        } catch is HTTPError {
            state = .failed("El servidor no está disponible en este momento. Intenta de nuevo en unos segundos.")
        } catch is DecodingError {
            state = .failed("La respuesta del servidor no tiene el formato esperado.")
        } catch let error as URLError where error.code == .timedOut {
            state = .failed("El servidor tardó demasiado en responder. Puede estar despertando: inténtalo de nuevo.")
        } catch {
            state = .failed("No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.")
        }
    }
}
