package app.mirachbudget.android.features.categorias

import app.mirachbudget.android.core.networking.ApiException
import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.CatalogoCategorias
import app.mirachbudget.android.core.networking.CategoriaCambios
import app.mirachbudget.android.core.networking.CategoriaCatalogo
import app.mirachbudget.android.core.networking.CategoriaException
import app.mirachbudget.android.core.networking.SessionExpiredException
import app.mirachbudget.android.features.categorias.CategoriasSamples.catalogo
import app.mirachbudget.android.features.categorias.CategoriasSamples.supermercado
import app.mirachbudget.android.features.categorias.DetalleCategoriaViewModel.BucketChange
import app.mirachbudget.android.features.categorias.DetalleCategoriaViewModel.Content
import app.mirachbudget.android.features.categorias.DetalleCategoriaViewModel.Failure
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Loading, editing, deleting and leaving "Detalle de categoría" (port of iOS `DetalleCategoriaViewModelTests`). */
class DetalleCategoriaViewModelTest : DetalleCategoriaTestBase() {
    private val renamed = supermercado.copy(nombre = "Súper")

    // --- loading

    @Test
    fun findsTheCategoryByIdInTheCatalogAndFillsTheForm() = runTest {
        val vm = loaded()

        assertEquals(Content.Loaded(supermercado), vm.state.value.content)
        assertEquals("Supermercado", vm.state.value.draftNombre)
        assertEquals(Bucket.Necesidades, vm.state.value.draftBucket)
        assertEquals("shopping-cart", vm.state.value.draftIcono)
        assertFalse(vm.state.value.hasChanges)
    }

    @Test
    fun aCategoryThatIsNotInTheCatalogIsGone() = runTest {
        api.onCategorias = { catalogo }
        val vm = viewModel("cat-deleted")

        vm.load()

        assertEquals(Content.NotFound, vm.state.value.content)
    }

    @Test
    fun aNetworkErrorIsAConnectionFailureAndRetryAsksAgain() = runTest {
        var calls = 0
        api.onCategorias = { if (calls++ == 0) throw IOException("offline") else catalogo }
        val vm = viewModel()

        vm.load()
        assertEquals(Content.Failed(Failure.Connection), vm.state.value.content)

        vm.retry()
        assertEquals(Content.Loaded(supermercado), vm.state.value.content)
    }

    @Test
    fun aServerProblemIsAServerFailureAndAnExpiredSessionShowsNothing() = runTest {
        api.onCategorias = { throw ApiException(500) }
        val server = viewModel()
        server.load()
        assertEquals(Content.Failed(Failure.Server), server.state.value.content)

        api.onCategorias = { throw SessionExpiredException() }
        val expired = viewModel()
        expired.load()
        assertEquals(Content.Loading, expired.state.value.content)
    }

    @Test
    fun aLoadCancelledBeforeItFinishedRunsAgainOnTheNextAppearance() = runTest {
        var calls = 0
        api.onCategorias = { if (calls++ == 0) throw CancellationException("left") else catalogo }
        val vm = viewModel()

        runCatching { vm.loadIfNeeded() }
        vm.loadIfNeeded()
        vm.loadIfNeeded()

        assertEquals(Content.Loaded(supermercado), vm.state.value.content)
        assertEquals(2, api.categoriasCalls)
    }

    @Test
    fun aLateAnswerFromAnOlderRequestDoesNotOverwriteTheNewerOne() = runTest {
        val slow = CompletableDeferred<CatalogoCategorias>()
        var calls = 0
        api.onCategorias = { if (calls++ == 0) slow.await() else CatalogoCategorias(listOf(renamed)) }
        val vm = viewModel()

        val first = launch { vm.load() }
        runCurrent()
        vm.load()
        slow.complete(catalogo)
        first.join()

        assertEquals(Content.Loaded(renamed), vm.state.value.content)
    }

    @Test
    fun aFailedRefreshKeepsTheScreenAndSaysSo() = runTest {
        val vm = loaded()
        api.onCategorias = { throw IOException("offline") }

        vm.refresh()

        assertEquals(Content.Loaded(supermercado), vm.state.value.content)
        assertEquals("No se pudo actualizar la categoría.", vm.state.value.refreshNotice)
        assertFalse(vm.state.value.isRefreshing)
    }

    @Test
    fun refreshingKeepsWhatThePersonIsTyping() = runTest {
        val vm = loaded()
        vm.setDraftNombre("Super")
        api.onCategorias = { CatalogoCategorias(listOf(supermercado)) }

        vm.refresh()

        assertEquals("Super", vm.state.value.draftNombre)
    }

    // --- system category

    @Test
    fun aSystemCategoryIsProtectedFromTheStartAndNeverSendsAnything() = runTest {
        val vm = loaded("cat-sys")
        assertTrue(vm.state.value.isProtected)
        vm.setDraftNombre("Otra")

        vm.save()
        vm.requestDeletion()
        vm.confirmDeletion()
        vm.beginAddPattern()

        assertTrue(api.actualizarCategoriaCalls.isEmpty())
        assertTrue(api.eliminarCategoriaCalls.isEmpty())
        assertFalse(vm.state.value.pendingDeletion)
        assertNull(vm.state.value.patternSheet)
    }

    @Test
    fun a403WhileSavingProtectsTheScreenUntilItIsLeft() = runTest {
        val vm = loaded()
        api.onActualizarCategoria = { _, _ -> throw CategoriaException.IsInternal() }
        vm.setDraftNombre("Otra")

        vm.save()

        assertTrue(vm.state.value.isProtected)
        assertEquals("Esta categoría es del sistema y no se puede editar ni eliminar", vm.state.value.fieldErrors.general)
    }

    // --- editing

    @Test
    fun savingSendsOnlyTheTrimmedNameByTheCategoryId() = runTest {
        val vm = loaded()
        api.onActualizarCategoria = { _, _ -> renamed }
        vm.setDraftNombre("  Súper  ")

        vm.save()

        assertEquals(listOf("cat-super" to CategoriaCambios(nombre = "Súper")), api.actualizarCategoriaCalls)
    }

    @Test
    fun aChangedIconIsSentAloneAndTheNameIsLeftOut() = runTest {
        val vm = loaded()
        api.onActualizarCategoria = { _, _ -> supermercado.copy(icono = "gift") }
        vm.setDraftIcono("gift")

        vm.save()

        assertEquals(listOf(CategoriaCambios(icono = "gift")), api.actualizarCategoriaCalls.map { it.second })
    }

    @Test
    fun anUnknownIconIsKeptUnlessThePersonPicksAnother() = runTest {
        val odd = supermercado.copy(icono = "rocket")
        api.onCategorias = { CatalogoCategorias(listOf(odd)) }
        val vm = viewModel()
        vm.load()

        assertEquals("rocket", vm.state.value.draftIcono)
        assertFalse(vm.state.value.hasChanges)
    }

    @Test
    fun noChangesMeansNothingIsSent() = runTest {
        val vm = loaded()
        vm.setDraftNombre("Supermercado ")

        vm.save()

        assertFalse(vm.state.value.hasChanges)
        assertTrue(api.actualizarCategoriaCalls.isEmpty())
    }

    @Test
    fun aSuccessfulSaveShowsTheServersAnswerAnnouncesItAndTellsTheOtherScreens() = runTest {
        val vm = loaded()
        api.onActualizarCategoria = { _, _ -> renamed }
        vm.setDraftNombre("Súper")

        vm.save()

        assertEquals(Content.Loaded(renamed), vm.state.value.content)
        assertEquals("Categoría guardada", vm.state.value.announcement)
        assertFalse(vm.state.value.hasChanges)
        assertFalse(vm.state.value.isSaving)
        assertEquals(1, changes)
    }

    @Test
    fun eachRejectionLandsOnItsControlAndWhatWasTypedStays() = runTest {
        val cases = listOf(
            CategoriaException.InvalidName() to "El nombre debe tener entre 1 y 40 caracteres",
            CategoriaException.DuplicateName() to "Ya tienes una categoría con ese nombre",
            CategoriaException.BucketNotAssignable() to "Elige un grupo: Necesidades, Gustos o Ahorro",
            CategoriaException.InvalidIcon() to "Elige un ícono válido de la lista",
            CategoriaException.Rejected("Otra cosa") to "Otra cosa",
        )
        for ((error, text) in cases) {
            val vm = loaded()
            api.onActualizarCategoria = { _, _ -> throw error }
            vm.setDraftNombre("Otra")

            vm.save()

            val errors = vm.state.value.fieldErrors
            assertEquals(text, errors.name ?: errors.bucket ?: errors.icon ?: errors.general)
            assertEquals("Otra", vm.state.value.draftNombre)
            assertEquals("nothing changed on screen", Content.Loaded(supermercado), vm.state.value.content)
            assertNull(vm.state.value.announcement)
        }
        assertEquals(0, changes)
    }

    @Test
    fun aMissingCategoryWhileSavingSaysSoAndTellsTheOtherScreens() = runTest {
        val vm = loaded()
        api.onActualizarCategoria = { _, _ -> throw CategoriaException.NotFound() }
        vm.setDraftNombre("Otra")

        vm.save()

        assertEquals(Content.NotFound, vm.state.value.content)
        assertEquals("the lists still show it", 1, changes)
    }

    @Test
    fun aConnectionFailureWhileSavingKeepsTheDraftWithAGeneralMessage() = runTest {
        val vm = loaded()
        api.onActualizarCategoria = { _, _ -> throw IOException("offline") }
        vm.setDraftNombre("Otra")

        vm.save()

        assertEquals("No pudimos guardar los cambios. Revisa tu conexión e inténtalo de nuevo.", vm.state.value.fieldErrors.general)
        assertEquals("Otra", vm.state.value.draftNombre)
        assertFalse(vm.state.value.isSaving)
    }

    @Test
    fun anExpiredSessionWhileSavingShowsNoError() = runTest {
        val vm = loaded()
        api.onActualizarCategoria = { _, _ -> throw SessionExpiredException() }
        vm.setDraftNombre("Otra")

        vm.save()

        assertTrue(vm.state.value.fieldErrors.isEmpty)
    }

    @Test
    fun whileSavingASecondSaveIsIgnored() = runTest {
        val vm = loaded()
        val gate = CompletableDeferred<CategoriaCatalogo>()
        api.onActualizarCategoria = { _, _ -> gate.await() }
        vm.setDraftNombre("Otra")

        val first = launch { vm.save() }
        runCurrent()
        assertTrue(vm.state.value.isSaving)
        vm.save()
        gate.complete(supermercado.copy(nombre = "Otra"))
        first.join()

        assertEquals(1, api.actualizarCategoriaCalls.size)
    }

    // --- changing bucket

    @Test
    fun movingToAnotherBucketAsksFirstNamingTheMovementsAndSendsNothingYet() = runTest {
        val vm = loaded()
        vm.setDraftBucket(Bucket.Ahorro)

        vm.save()

        assertEquals(BucketChange(12, Bucket.Necesidades, Bucket.Ahorro), vm.state.value.pendingBucketChange)
        assertTrue(api.actualizarCategoriaCalls.isEmpty())
    }

    @Test
    fun confirmingTheBucketChangeSendsTheBucketOnly() = runTest {
        val vm = loaded()
        api.onActualizarCategoria = { _, _ -> supermercado.copy(bucket = Bucket.Ahorro) }
        vm.setDraftBucket(Bucket.Ahorro)
        vm.save()

        vm.confirmBucketChange()

        assertEquals(listOf("cat-super" to CategoriaCambios(bucket = Bucket.Ahorro)), api.actualizarCategoriaCalls)
        assertNull(vm.state.value.pendingBucketChange)
        assertEquals(1, changes)
    }

    @Test
    fun cancellingTheBucketChangeSendsNothingAndKeepsTheDraft() = runTest {
        val vm = loaded()
        vm.setDraftBucket(Bucket.Ahorro)
        vm.save()

        vm.cancelBucketChange()

        assertNull(vm.state.value.pendingBucketChange)
        assertEquals(Bucket.Ahorro, vm.state.value.draftBucket)
        assertTrue(api.actualizarCategoriaCalls.isEmpty())
    }

    @Test
    fun aCategoryWithNoMovementsStillAsksBeforeChangingBucket() = runTest {
        val vm = loaded("cat-empty")
        vm.setDraftBucket(Bucket.Ahorro)

        vm.save()

        assertEquals(BucketChange(0, Bucket.Deseos, Bucket.Ahorro), vm.state.value.pendingBucketChange)
    }

    @Test
    fun aNameAndABucketChangeTogetherAreSentTogetherAfterConfirming() = runTest {
        val vm = loaded()
        api.onActualizarCategoria = { _, _ -> renamed.copy(bucket = Bucket.Ahorro) }
        vm.setDraftNombre("Súper")
        vm.setDraftBucket(Bucket.Ahorro)
        vm.save()
        assertTrue(api.actualizarCategoriaCalls.isEmpty())

        vm.confirmBucketChange()

        assertEquals(listOf(CategoriaCambios(nombre = "Súper", bucket = Bucket.Ahorro)), api.actualizarCategoriaCalls.map { it.second })
    }

    // --- deleting

    @Test
    fun askingToDeleteOnlyAsksAndCancellingChangesNothing() = runTest {
        val vm = loaded()

        vm.requestDeletion()
        assertTrue(vm.state.value.pendingDeletion)
        vm.cancelDeletion()

        assertFalse(vm.state.value.pendingDeletion)
        assertTrue(api.eliminarCategoriaCalls.isEmpty())
    }

    @Test
    fun confirmingDeletesByIdTellsTheOtherScreensAndLeaves() = runTest {
        val vm = loaded()

        vm.requestDeletion()
        vm.confirmDeletion()

        assertEquals(listOf("cat-super"), api.eliminarCategoriaCalls)
        assertTrue(vm.state.value.isGone)
        assertFalse(vm.state.value.isDeleting)
        assertEquals(1, changes)
        assertEquals(listOf("Supermercado"), deleted)
    }

    @Test
    fun aMissingCategoryWhileDeletingCountsAsDeletedWithoutAnnouncingIt() = runTest {
        val vm = loaded()
        api.onEliminarCategoria = { throw CategoriaException.NotFound() }

        vm.requestDeletion()
        vm.confirmDeletion()

        assertTrue(vm.state.value.isGone)
        assertEquals(1, changes)
        assertTrue(deleted.isEmpty())
    }

    @Test
    fun aFailedDeletionKeepsTheCategoryAndSaysSo() = runTest {
        val vm = loaded()
        api.onEliminarCategoria = { throw IOException("offline") }

        vm.requestDeletion()
        vm.confirmDeletion()

        assertFalse(vm.state.value.isGone)
        assertEquals(Content.Loaded(supermercado), vm.state.value.content)
        assertEquals("No pudimos eliminar la categoría. Revisa tu conexión e inténtalo de nuevo.", vm.state.value.notice)
        assertEquals(0, changes)
    }

    @Test
    fun aSystemCategoryRefusedWith403WhileDeletingBecomesProtected() = runTest {
        val vm = loaded()
        api.onEliminarCategoria = { throw CategoriaException.IsInternal() }

        vm.requestDeletion()
        vm.confirmDeletion()

        assertTrue(vm.state.value.isProtected)
        assertEquals("Esta categoría es del sistema y no se puede editar ni eliminar", vm.state.value.fieldErrors.general)
        assertFalse(vm.state.value.isGone)
    }

    @Test
    fun whileDeletingASecondConfirmationIsIgnored() = runTest {
        val vm = loaded()
        val gate = CompletableDeferred<Unit>()
        api.onEliminarCategoria = { gate.await() }

        vm.requestDeletion()
        val first = launch { vm.confirmDeletion() }
        runCurrent()
        assertTrue(vm.state.value.isDeleting)
        vm.requestDeletion()
        vm.confirmDeletion()
        gate.complete(Unit)
        first.join()

        assertEquals(1, api.eliminarCategoriaCalls.size)
    }

    // --- leaving with unsaved changes

    @Test
    fun leavingWithUnsavedChangesAsksAndDiscardingRestoresTheForm() = runTest {
        val vm = loaded()
        vm.setDraftNombre("Otra")
        vm.setDraftBucket(Bucket.Ahorro)

        vm.askToDiscard()
        assertTrue(vm.state.value.pendingDiscard)
        vm.discardChanges()

        assertFalse(vm.state.value.pendingDiscard)
        assertEquals("Supermercado", vm.state.value.draftNombre)
        assertEquals(Bucket.Necesidades, vm.state.value.draftBucket)
        assertFalse(vm.state.value.hasChanges)
    }

    @Test
    fun leavingWithNoChangesNeverAsks() = runTest {
        val vm = loaded()

        vm.askToDiscard()

        assertFalse(vm.state.value.pendingDiscard)
    }

    @Test
    fun keepingEditingKeepsTheDraft() = runTest {
        val vm = loaded()
        vm.setDraftNombre("Otra")
        vm.askToDiscard()

        vm.cancelDiscard()

        assertFalse(vm.state.value.pendingDiscard)
        assertEquals("Otra", vm.state.value.draftNombre)
    }
}
