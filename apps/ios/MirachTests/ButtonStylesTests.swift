import SwiftUI
import Testing
import UIKit
@testable import Mirach

/// Shared buttons (S3): full width, 52pt high as in Figma's «Botón», and they grow with the text.
@MainActor
struct ButtonStylesTests {
    private let space = CGSize(width: 320, height: CGFloat.greatestFiniteMagnitude)

    private func size(of view: some View) -> CGSize {
        UIHostingController(rootView: view).sizeThatFits(in: space)
    }

    @Test func theFilledButtonIsAtLeast52ptHighAndFillsTheWidth() {
        let button = size(of: Button("Continuar") {}.prominentButton())
        #expect(button.height >= 52)
        #expect(button.width == 320)
    }

    @Test func theOutlinedButtonIsAtLeast52ptHighAndFillsTheWidth() {
        let button = size(of: Button("Cancelar") {}.secondaryButton())
        #expect(button.height >= 52)
        #expect(button.width == 320)
    }

    @Test func aDestructiveFilledButtonUsesTheDestructiveColour() {
        #expect(PrimaryButtonStyle.fill(destructive: true) == Color.Mirach.Base.destructive)
        #expect(PrimaryButtonStyle.fill(destructive: false) == Color.Mirach.Base.primary)
    }

    @Test func aLongLabelWrapsInsteadOfBeingCut() {
        let long = String(repeating: "Confirmar todos los movimientos ", count: 3)
        let wrapped = size(of: Button(long) {}.prominentButton())
        let short = size(of: Button("Ok") {}.prominentButton())
        #expect(wrapped.height > short.height)
    }

    @Test func theOutlinedStyleKeepsTheInkParameterOtherScreensPass() {
        let button = size(of: Button("Ver") {}.buttonStyle(SecondaryButtonStyle(ink: Color.Mirach.Base.foreground)))
        #expect(button.height >= 52)
    }
}
