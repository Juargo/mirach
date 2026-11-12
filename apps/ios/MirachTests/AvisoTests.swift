import SwiftUI
import Testing
import UIKit
@testable import Mirach

/// Aviso (S3): a strip at least 44pt high whose message wraps; delivered without a screen using it yet.
@MainActor
struct AvisoTests {
    private func height(_ message: String, width: CGFloat = 320) -> CGFloat {
        let host = UIHostingController(rootView: Aviso(message: message, action: "Ver") {})
        return host.sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude)).height
    }

    @Test func aShortMessageStillGivesA44ptTarget() {
        #expect(height("Listo") >= 44)
    }

    @Test func aLongMessageWrapsInsteadOfTruncating() {
        let long = String(repeating: "Tu cartola ya está lista para revisar. ", count: 4)
        #expect(height(long) > height("Listo") + 20)
    }

    @Test func theBorderedVariantDoesNotChangeTheSize() {
        let plain = UIHostingController(rootView: Aviso(message: "Listo", action: "Ver") {})
        let bordered = UIHostingController(rootView: Aviso(message: "Listo", action: "Ver", bordered: true) {})
        let space = CGSize(width: 320, height: CGFloat.greatestFiniteMagnitude)

        #expect(plain.sizeThatFits(in: space) == bordered.sizeThatFits(in: space))
    }
}
