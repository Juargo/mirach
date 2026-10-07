import Foundation
import Testing
@testable import Mirach

/// File rules and the real staging on disk (a throwaway folder per test).
struct CartolaStagingTests {
    private func workspace() throws -> (staging: TemporaryCartolaStaging, source: URL, root: URL) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("t5a-\(UUID().uuidString)")
        let source = root.appendingPathComponent("picked")
        try FileManager.default.createDirectory(at: source, withIntermediateDirectories: true)
        return (TemporaryCartolaStaging(directory: root.appendingPathComponent("staged")), source, root)
    }

    private func write(_ bytes: Int, named name: String, in folder: URL) throws -> URL {
        let url = folder.appendingPathComponent(name)
        try Data(count: bytes).write(to: url)
        return url
    }

    // MARK: rules

    @Test(arguments: ["a.xlsx", "A.XLSX", "estado de cuenta.pdf", "x.Pdf"])
    func acceptsXlsxAndPdfInAnyCase(name: String) {
        #expect(CartolaFileRules.problem(filename: name, byteCount: 1_000) == nil)
    }

    @Test(arguments: ["a.xls", "a.csv", "a", "a.pdf.exe", ".xlsx.txt"])
    func rejectsOtherExtensions(name: String) {
        #expect(CartolaFileRules.problem(filename: name, byteCount: 1_000) == .unsupportedExtension)
    }

    @Test func tenMegabytesIsTheLimit() {
        #expect(CartolaFileRules.problem(filename: "a.xlsx", byteCount: 10 * 1024 * 1024) == nil)
        #expect(CartolaFileRules.problem(filename: "a.xlsx", byteCount: 10 * 1024 * 1024 + 1) == .tooLarge)
    }

    // MARK: staging

    @Test func copiesTheFileKeepingItsNameAndSize() throws {
        let (staging, source, _) = try workspace()
        let picked = try write(1_234, named: "mi cartola.xlsx", in: source)

        let file = try staging.stage(picked)

        #expect(file.filename == "mi cartola.xlsx")
        #expect(file.byteCount == 1_234)
        #expect(file.url != picked)
        #expect(FileManager.default.fileExists(atPath: file.url.path))
        #expect(file.url.path.hasPrefix(staging.directory.path))
    }

    @Test func refusesAWrongExtensionWithoutCopying() throws {
        let (staging, source, _) = try workspace()
        let picked = try write(10, named: "notas.txt", in: source)

        #expect(throws: CartolaFileProblem.unsupportedExtension) { try staging.stage(picked) }
        #expect(!FileManager.default.fileExists(atPath: staging.directory.path))
    }

    @Test func refusesAnOversizedFileWithoutCopying() throws {
        let (staging, source, _) = try workspace()
        let picked = try write(CartolaFileRules.maxBytes + 1, named: "grande.pdf", in: source)

        #expect(throws: CartolaFileProblem.tooLarge) { try staging.stage(picked) }
        #expect(!FileManager.default.fileExists(atPath: staging.directory.path))
    }

    @Test func aMissingFileIsUnreadable() throws {
        let (staging, source, _) = try workspace()

        #expect(throws: CartolaFileProblem.unreadable) {
            try staging.stage(source.appendingPathComponent("no-existe.xlsx"))
        }
    }

    @Test func discardDeletesTheCopyAndNotTheOriginal() throws {
        let (staging, source, _) = try workspace()
        let picked = try write(10, named: "a.xlsx", in: source)
        let file = try staging.stage(picked)

        staging.discard(file)

        #expect(!FileManager.default.fileExists(atPath: file.url.path))
        #expect(!FileManager.default.fileExists(atPath: file.url.deletingLastPathComponent().path))
        #expect(FileManager.default.fileExists(atPath: picked.path))
    }

    @Test func discardNeverDeletesOutsideItsOwnFolder() throws {
        let (staging, source, _) = try workspace()
        let outsider = try write(10, named: "ajeno.xlsx", in: source)

        staging.discard(CartolaFile(url: outsider, filename: "ajeno.xlsx", byteCount: 10))

        #expect(FileManager.default.fileExists(atPath: outsider.path))
    }

    @Test func purgeAllRemovesLeftoversOfAPreviousRun() throws {
        let (staging, source, _) = try workspace()
        let file = try staging.stage(try write(10, named: "a.xlsx", in: source))

        staging.purgeAll()

        #expect(!FileManager.default.fileExists(atPath: file.url.path))
    }
}
