import Testing
@testable import Mirach

/// The income row of the Inicio (S4.4): amount with where the base comes from.
struct ResumenIncomeRowTests {
    @Test func theValueSaysWhereTheBaseComesFrom() {
        #expect(ResumenPresentation.incomeValue(1_250_000, fuente: .declarado) == "$1.250.000 · declarado")
        #expect(ResumenPresentation.incomeValue(1_250_000, fuente: .detectado) == "$1.250.000 · detectado")
    }

    @Test func voiceOverReadsTheLabelTheSignedAmountAndTheSource() {
        #expect(ResumenPresentation.incomeSpoken(1_250_000, fuente: .declarado)
            == "Ingresos del mes. Ingreso de $1.250.000, declarado")
        #expect(ResumenPresentation.incomeSpoken(0, fuente: .detectado) == "Ingresos del mes. Sin ingreso, detectado")
    }
}
