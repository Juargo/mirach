import Foundation
import Testing
@testable import Mirach

struct IngresosPresentationTests {
    @Test func countsUseTheSingularForOne() {
        #expect(IngresosPresentation.count(1) == "1 movimiento")
        #expect(IngresosPresentation.count(0) == "0 movimientos")
        #expect(IngresosPresentation.count(4) == "4 movimientos")
    }

    @Test func spokenIncomeSaysIncomeAndNeverSpend() {
        #expect(Format.spokenIncome(1_650_000) == "Ingreso de $1.650.000")
        #expect(Format.spokenIncome(0) == "Sin ingreso")
        #expect(Format.spokenIncome(-5_000) == "Ajuste negativo de $5.000")
    }

    @Test func theRowReadsDescriptionAmountDateAndOrigin() {
        let income = SampleData.ingresosSeptiembre.transacciones[0]
        #expect(IngresosPresentation.rowLabel(income) == "SUELDO EMPRESA. Ingreso de $1.650.000. 3 oct. Banco de Chile")
    }

    @Test func theHeaderReadsTotalAndCount() {
        #expect(IngresosPresentation.headerLabel(SampleData.ingresosSeptiembre) == "Ingreso. Ingreso de $1.720.000. 2 movimientos")
    }

    @Test func theVisibleFiguresCarryTheSignTheVoiceSays() {
        #expect(Format.income(1_650_000) == "+$1.650.000")
    }
}
