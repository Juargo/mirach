import Foundation

/// Why a picked file is refused before any call to the API.
enum CartolaFileProblem: Error, Equatable {
    case unsupportedExtension
    case tooLarge
    /// The system would not let the app read it.
    case unreadable
}

/// The rules the catalog puts on a file before it is sent (`subir-cartola.md`, "Elegir archivo").
enum CartolaFileRules {
    /// The API's own limit: 10 MB.
    static let maxBytes = 10 * 1024 * 1024
    static let allowedExtensions: Set<String> = ["xlsx", "pdf"]

    static func problem(filename: String, byteCount: Int) -> CartolaFileProblem? {
        let pathExtension = (filename as NSString).pathExtension.lowercased()
        if !allowedExtensions.contains(pathExtension) { return .unsupportedExtension }
        if byteCount > maxBytes { return .tooLarge }
        return nil
    }
}

/// Keeps a private copy of the picked statement for as long as the flow lasts: `commit`
/// needs the file again, and the system may release the original at any moment.
protocol CartolaStaging: Sendable {
    /// Validates and copies `source`. Throws `CartolaFileProblem`.
    func stage(_ source: URL) throws -> CartolaFile
    /// Deletes one staged copy (end of the flow, discard, sign-out).
    func discard(_ file: CartolaFile)
    /// Deletes everything staged, including leftovers of a previous run (the app was killed
    /// before the flow ended).
    func purgeAll()
}

/// Staging in the app's temporary folder. Each copy gets its own subfolder so the original
/// file name survives (the API reads the extension) without two files ever colliding.
struct TemporaryCartolaStaging: CartolaStaging {
    let directory: URL

    init(directory: URL = FileManager.default.temporaryDirectory.appendingPathComponent("cartolas", isDirectory: true)) {
        self.directory = directory
    }

    func stage(_ source: URL) throws -> CartolaFile {
        // Files from the document picker live outside the app: reading them needs
        // "security-scoped" access, opened here and always closed. It returns false for
        // URLs that are not scoped (a file already inside the app), which is fine.
        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }

        let filename = source.lastPathComponent
        let byteCount: Int
        do {
            byteCount = try source.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        } catch {
            throw CartolaFileProblem.unreadable
        }
        // Check before copying: a huge file must not fill the device.
        if let problem = CartolaFileRules.problem(filename: filename, byteCount: byteCount) { throw problem }

        let folder = directory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let copy = folder.appendingPathComponent(filename)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try FileManager.default.copyItem(at: source, to: copy)
        } catch {
            try? FileManager.default.removeItem(at: folder)
            throw CartolaFileProblem.unreadable
        }
        return CartolaFile(url: copy, filename: filename, byteCount: byteCount)
    }

    func discard(_ file: CartolaFile) {
        // Only ever delete inside our own folder, whatever URL is passed in.
        let folder = file.url.deletingLastPathComponent()
        guard folder.deletingLastPathComponent().standardizedFileURL == directory.standardizedFileURL else { return }
        try? FileManager.default.removeItem(at: folder)
    }

    func purgeAll() {
        try? FileManager.default.removeItem(at: directory)
    }
}
