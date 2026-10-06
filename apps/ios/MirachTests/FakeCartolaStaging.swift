import Foundation
@testable import Mirach

/// `CartolaStaging` that touches no disk: records what was staged, discarded and purged.
final class FakeCartolaStaging: CartolaStaging, @unchecked Sendable {
    private let lock = NSLock()
    private var _staged: [URL] = []
    private var _discarded: [CartolaFile] = []
    private var _purges = 0
    private var _next = 0
    private var failure: CartolaFileProblem?

    var staged: [URL] { lock.withLock { _staged } }
    var discarded: [CartolaFile] { lock.withLock { _discarded } }
    var purges: Int { lock.withLock { _purges } }

    func failNextStage(with problem: CartolaFileProblem) { lock.withLock { failure = problem } }

    func stage(_ source: URL) throws -> CartolaFile {
        try lock.withLock {
            if let problem = failure {
                failure = nil
                throw problem
            }
            _staged.append(source)
            _next += 1
            return CartolaFile(
                url: URL(fileURLWithPath: "/staged/\(_next)/\(source.lastPathComponent)"),
                filename: source.lastPathComponent, byteCount: 2_048
            )
        }
    }

    func discard(_ file: CartolaFile) { lock.withLock { _discarded.append(file) } }
    func purgeAll() { lock.withLock { _purges += 1 } }
}
