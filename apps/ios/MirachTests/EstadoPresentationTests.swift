import SwiftUI
import Testing
@testable import Mirach

/// Estado component and month verdict copy (S3, S4.2, S5).
struct EstadoPresentationTests {
    @Test func theWordComesFromTheCopyTokens() {
        #expect(EstadoSemaforo.verde.word == MirachCopy.Estado.bien)
        #expect(EstadoSemaforo.amarillo.word == MirachCopy.Estado.cerca)
        #expect(EstadoSemaforo.rojo.word == MirachCopy.Estado.sobre)
        #expect(EstadoSemaforo.verde.word == "Bien")
    }

    @Test func theMarkIsTheFillTokenAndTheTextUsesItsTextToken() {
        #expect(EstadoSemaforo.verde.markColor == Color.Mirach.Estado.bien)
        #expect(EstadoSemaforo.amarillo.markColor == Color.Mirach.Estado.cerca)
        #expect(EstadoSemaforo.rojo.markColor == Color.Mirach.Estado.sobre)
        #expect(EstadoSemaforo.verde.textColor == Color.Mirach.Estado.bienText)
        #expect(EstadoSemaforo.amarillo.textColor == Color.Mirach.Estado.cercaText)
        // The design has no separate text token for sobre.
        #expect(EstadoSemaforo.rojo.textColor == Color.Mirach.Estado.sobre)
    }

    @Test func theMonthVerdictHasOneSentencePerState() {
        #expect(ResumenPresentation.verdict(for: .verde) == "Dentro de la meta")
        #expect(ResumenPresentation.verdict(for: .amarillo) == "Cerca de la meta")
        #expect(ResumenPresentation.verdict(for: .rojo) == "Sobre la meta")
    }

    @Test func noMonthStateShowsNoVerdict() {
        #expect(ResumenPresentation.verdict(for: nil) == nil)
    }
}
