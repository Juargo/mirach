package app.mirachbudget.android.core.formatting

import app.mirachbudget.android.core.networking.Periodo
import org.junit.Assert.assertEquals
import org.junit.Test

/** The display rules of the catalog, identical to the iPhone `Format`. */
class FormatTest {
    @Test
    fun moneyGroupsThousandsWithDotsEvenOnFourDigits() {
        assertEquals("$0", Format.money(0))
        assertEquals("$999", Format.money(999))
        assertEquals("$1.000", Format.money(1_000))
        assertEquals("$1.234.567", Format.money(1_234_567))
    }

    @Test
    fun moneyKeepsTheSignAndStaysExactBeyondDoublePrecision() {
        assertEquals("-$1.234", Format.money(-1_234))
        assertEquals("$9.007.199.254.740.993", Format.money(9_007_199_254_740_993))
        assertEquals("-$9.223.372.036.854.775.808", Format.money(Long.MIN_VALUE))
    }

    @Test
    fun incomeCarriesItsSignAndZeroCarriesNone() {
        assertEquals("+$1.000", Format.income(1_000))
        assertEquals("$0", Format.income(0))
        assertEquals("-$1.000", Format.income(-1_000))
    }

    @Test
    fun expenseIsShownNegativeAndARefundPositive() {
        assertEquals("-$1.000", Format.expense(1_000))
        assertEquals("$0", Format.expense(0))
        assertEquals("+$1.000", Format.expense(-1_000))
    }

    @Test
    fun spokenIncomeNeverCallsMoneyGoingOutIncome() {
        assertEquals("Ingreso de $1.000", Format.spokenIncome(1_000))
        assertEquals("Sin ingreso", Format.spokenIncome(0))
        assertEquals("Ajuste negativo de $1.000", Format.spokenIncome(-1_000))
    }

    @Test
    fun spokenExpenseNeverCallsARefundSpend() {
        assertEquals("Gasto de $1.000", Format.spokenExpense(1_000))
        assertEquals("Sin gasto", Format.spokenExpense(0))
        assertEquals("Reembolso neto de $1.000", Format.spokenExpense(-1_000))
    }

    @Test
    fun percentUsesADecimalCommaAndDropsTrailingZeros() {
        assertEquals("50%", Format.percent(5_000))
        assertEquals("30,5%", Format.percent(3_050))
        assertEquals("30,25%", Format.percent(3_025))
        assertEquals("0,05%", Format.percent(5))
        assertEquals("0%", Format.percent(0))
        assertEquals("-2,5%", Format.percent(-250))
    }

    @Test
    fun aMissingPercentIsAnEmDash() {
        assertEquals("—", Format.percent(null))
        assertEquals("45%", Format.percent(4_500))
    }

    @Test
    fun monthsAreNamedInSpanish() {
        assertEquals("septiembre de 2026", Format.month(Periodo(2026, 9)))
        assertEquals("Septiembre de 2026", Format.monthTitle(Periodo(2026, 9)))
        assertEquals("Enero de 2027", Format.monthTitle(Periodo(2027, 1)))
        assertEquals("diciembre de 2026", Format.month(Periodo(2026, 12)))
    }
}
