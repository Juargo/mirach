import Testing
@testable import Mirach

/// Bucket bar rules (S3): fill and tick fractions, caption and what VoiceOver reads (S5).
/// Replaces the old row's accessibility tests: the spend wording and its sign logic are unchanged.
struct BucketBarPresentationTests {
    private func item(
        total: Int, bp: Int? = 3050, meta: Int = 3000, estado: EstadoSemaforo? = nil
    ) -> BucketResumen {
        BucketResumen(bucket: .deseos, total: total, porcentajeBp: bp, metaBp: meta, estado: estado)
    }

    @Test func theFillIsTheRealShareOfTheIncome() {
        #expect(BucketBarPresentation.fillFraction(of: item(total: 1, bp: 3050)) == 0.305)
        #expect(BucketBarPresentation.fillFraction(of: item(total: 1, bp: 0)) == 0)
    }

    @Test func theFillIsClampedAndEmptyWithoutAShare() {
        #expect(BucketBarPresentation.fillFraction(of: item(total: 1, bp: 15_000)) == 1)
        #expect(BucketBarPresentation.fillFraction(of: item(total: 1, bp: -200)) == 0)
        #expect(BucketBarPresentation.fillFraction(of: item(total: 0, bp: nil)) == 0)
    }

    @Test func theTickIsTheTargetShareClamped() {
        #expect(BucketBarPresentation.tickFraction(of: item(total: 1, meta: 5000)) == 0.5)
        #expect(BucketBarPresentation.tickFraction(of: item(total: 1, meta: 12_000)) == 1)
        #expect(BucketBarPresentation.tickFraction(of: item(total: 1, meta: -1)) == 0)
    }

    @Test func theCaptionReadsRealShareOfTargetAndAmountSpent() {
        #expect(BucketBarPresentation.caption(for: item(total: 700_000, bp: 5600, meta: 5000)) == "56% de 50% · $700.000")
        #expect(BucketBarPresentation.caption(for: item(total: 305_000, bp: 3050)) == "30,5% de 30% · $305.000")
    }

    @Test func aMonthWithoutIncomeShowsADashForTheShare() {
        #expect(BucketBarPresentation.caption(for: item(total: 0, bp: nil, meta: 2000)) == "— de 20% · $0")
    }

    @Test func positiveTotalIsReadAsSpend() {
        #expect(BucketBarPresentation.accessibilityLabel(for: item(total: 305_000))
            == "Gustos. Gasto de $305.000, 30,5% del ingreso. Meta 30%")
    }

    @Test func theStateWordIsReadAfterTheName() {
        #expect(BucketBarPresentation.accessibilityLabel(for: item(total: 305_000, estado: .amarillo))
            == "Gustos. Cerca. Gasto de $305.000, 30,5% del ingreso. Meta 30%")
        #expect(BucketBarPresentation.accessibilityLabel(for: item(total: 1_000, estado: .rojo)).hasPrefix("Gustos. Sobre. "))
        #expect(BucketBarPresentation.accessibilityLabel(for: item(total: 1_000, estado: .verde)).hasPrefix("Gustos. Bien. "))
    }

    @Test func zeroTotalIsReadAsNoSpend() {
        #expect(BucketBarPresentation.accessibilityLabel(for: item(total: 0, bp: nil))
            == "Gustos. Sin gasto, sin porcentaje del ingreso. Meta 30%")
    }

    @Test func negativeTotalIsReadAsMoneyComingInLikeTheVisiblePlusSign() {
        #expect(BucketBarPresentation.accessibilityLabel(for: item(total: -2000))
            == "Gustos. Reembolso neto de $2.000, 30,5% del ingreso. Meta 30%")
    }

    @Test func theSmallestIntegerDoesNotTrap() {
        let text = BucketBarPresentation.accessibilityLabel(for: item(total: Int.min))
        #expect(text.contains("Reembolso neto de $9.223.372.036.854.775.808"))
    }
}
