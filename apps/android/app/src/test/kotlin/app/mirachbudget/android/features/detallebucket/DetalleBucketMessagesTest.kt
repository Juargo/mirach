package app.mirachbudget.android.features.detallebucket

import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.PatronExistente
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.cafe
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.detalle
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.grupos
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.moved
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.restaurantes
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.septiembre
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.suggestion
import app.mirachbudget.android.features.detallebucket.DetalleBucketViewModel.Failure
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DetalleBucketMessagesTest {
    @Test
    fun theScreenCopyIsTheIosOne() {
        assertEquals("Cargando movimientos…", DetalleBucketMessages.LOADING)
        assertEquals("Reintentar", DetalleBucketMessages.RETRY)
        assertEquals("Problema de conexión. Revisa tu conexión e inténtalo de nuevo.", DetalleBucketMessages.loadFailure(Failure.Connection))
        assertEquals("No pudimos cargar los movimientos. Inténtalo de nuevo en unos segundos.", DetalleBucketMessages.loadFailure(Failure.Server))
        assertEquals("Sin movimientos en septiembre de 2026", DetalleBucketMessages.empty(septiembre))
        assertEquals("Meta: 30%", DetalleBucketMessages.meta(3_000))
        assertEquals("30,5% del ingreso", DetalleBucketMessages.share(3_050))
    }

    @Test
    fun countsUseTheSingularForOne() {
        assertEquals("1 movimiento", DetalleBucketMessages.movements(1))
        assertEquals("3 movimientos", DetalleBucketMessages.movements(3))
        assertEquals("1 categoría", DetalleBucketMessages.categories(1))
        assertEquals("2 categorías", DetalleBucketMessages.categories(2))
    }

    @Test
    fun aRowSaysItsDateAndOriginAndIsReadWithItsAmount() {
        assertEquals("5 sep · Banco de Chile", DetalleBucketMessages.rowSubtitle(cafe))
        assertEquals("CAFE CENTRAL. Gasto de $4.500. 5 sep. Banco de Chile", DetalleBucketMessages.rowLabel(cafe))
        assertEquals("5 sep · -$4.500", DetalleBucketMessages.sheetDetail(cafe))
    }

    @Test
    fun theHeaderAndAGroupAreReadWithTheSpendSignAndTheTarget() {
        assertEquals(
            "Gustos. Gasto de $31.490. 30,5% del ingreso. Meta 30%. 3 movimientos. 3 categorías",
            DetalleBucketMessages.headerLabel(detalle()),
        )
        assertEquals("Restaurantes. 1 movimiento. Gasto de $4.500", DetalleBucketMessages.groupLabel(grupos().first()))
    }

    @Test
    fun theBucketChangeMessageNamesBothBucketsWithTheOfficialLabels() {
        assertEquals("Cambiar de grupo", DetalleBucketMessages.BUCKET_CHANGE_TITLE)
        assertEquals(
            "Este movimiento pasará de Gustos a Necesidades y cambiará el cálculo del mes.",
            DetalleBucketMessages.bucketChangeMessage(Bucket.Deseos, Bucket.Necesidades),
        )
    }

    @Test
    fun theCheckboxNamesTheSuggestedTextAndCountsTheOtherMovements() {
        assertEquals("Aplicar a “tienda ropa”", DetalleBucketMessages.applyTitle("tienda ropa"))
        assertEquals("Los próximos que lleguen", DetalleBucketMessages.applySubtitle(0))
        assertEquals("1 movimiento más y los próximos que lleguen", DetalleBucketMessages.applySubtitle(1))
        assertEquals("4 movimientos más y los próximos que lleguen", DetalleBucketMessages.applySubtitle(4))
    }

    @Test
    fun aTextOfAnotherCategorySaysItWillMoveHere() {
        val elsewhere = PatronExistente("p1", "c-otra", "Compras", Bucket.Deseos)
        assertEquals("Ya está en Compras: se moverá aquí.", DetalleBucketMessages.applyElsewhere(elsewhere, restaurantes.id))
        assertNull(DetalleBucketMessages.applyElsewhere(elsewhere.copy(categoriaId = restaurantes.id), restaurantes.id))
        assertNull(DetalleBucketMessages.applyElsewhere(null, restaurantes.id))
    }

    @Test
    fun talkBackReadsTheCheckboxAsOneSentence() {
        val elsewhere = PatronExistente("p1", "c-otra", "Compras", Bucket.Deseos)
        assertEquals(
            "Aplicar a “tienda ropa”. 2 movimientos más y los próximos que lleguen. Ya está en Compras: se moverá aquí.",
            DetalleBucketMessages.applyLabel(suggestion(existente = elsewhere), restaurantes.id),
        )
    }

    @Test
    fun theAnnouncementAddsTheMovedOnesOnlyWhenThereAreAny() {
        assertEquals("Movida a Gustos · Restaurantes", DetalleBucketMessages.movedAnnouncement(moved(restaurantes)))
        assertEquals("Movida a Gustos · Restaurantes · 3 movidos", DetalleBucketMessages.movedAnnouncement(moved(restaurantes, movidos = 3)))
    }

    @Test
    fun guardarSaysWhereTheMovementGoesOrThatACategoryIsMissing() {
        assertEquals("Guardar", DetalleBucketMessages.SAVE)
        assertEquals("Mueve el movimiento a Restaurantes", DetalleBucketMessages.saveHint(restaurantes))
        assertEquals("Elige una categoría primero", DetalleBucketMessages.saveHint(null))
    }
}
