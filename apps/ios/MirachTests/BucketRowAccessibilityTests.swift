import Testing
@testable import Mirach

struct BucketRowAccessibilityTests {
    private func item(total: Int, bp: Int? = 3050) -> BucketResumen {
        BucketResumen(bucket: .deseos, total: total, porcentajeBp: bp, metaBp: 3000, estado: nil)
    }

    @Test func positiveTotalIsReadAsSpend() {
        #expect(BucketRow.accessibilityLabel(for: item(total: 305_000))
            == "Deseos. Gasto de $305.000, 30,5% del ingreso. Meta 30%")
    }

    @Test func zeroTotalIsReadAsNoSpend() {
        #expect(BucketRow.accessibilityLabel(for: item(total: 0, bp: nil))
            == "Deseos. Sin gasto, sin porcentaje del ingreso. Meta 30%")
    }

    @Test func negativeTotalIsReadAsMoneyComingInLikeTheVisiblePlusSign() {
        // On screen: Format.expense(-2000) == "+$2.000".
        #expect(BucketRow.accessibilityLabel(for: item(total: -2000))
            == "Deseos. Reembolso neto de $2.000, 30,5% del ingreso. Meta 30%")
    }

    @Test func theSmallestIntegerDoesNotTrap() {
        let text = BucketRow.accessibilityLabel(for: item(total: Int.min))
        #expect(text.contains("Reembolso neto de $9.223.372.036.854.775.808"))
    }
}
