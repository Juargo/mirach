package app.mirachbudget.android.features.subircartola

import app.mirachbudget.android.core.networking.Consentimientos
import app.mirachbudget.android.core.networking.IngestaException
import app.mirachbudget.android.core.staging.CartolaFileProblem
import app.mirachbudget.android.features.subircartola.SubirCartolaSamples.commitResult
import app.mirachbudget.android.features.subircartola.SubirCartolaSamples.preview
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.ImportFailure
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.SharedFileReceipt
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.Step
import java.io.IOException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** S2: a `.pdf` or `.xlsx` shared from another app enters the same flow as the picker. */
class SubirCartolaSharedFileTest : SubirCartolaTestBase() {
    private var consumedCalls = 0

    private suspend fun SubirCartolaViewModel.receive(name: String = "compartida.pdf") =
        receiveSharedFile(FakeSource(name)) { consumedCalls++ }

    private suspend fun waitingForConsent(): SubirCartolaViewModel {
        api.onConsentimientos = { Consentimientos(cartolasVigente = false) }
        val vm = viewModel()
        vm.start()
        assertEquals(Step.Consentimiento(), vm.state.value.step)
        return vm
    }

    @Test
    fun `on the initial screen the shared file is staged and previewed like a picked one`() = runTest {
        api.onPreviewIngesta = { _, _ -> preview() }
        val vm = started()

        val receipt = vm.receive()

        assertEquals(SharedFileReceipt.CONSUMED, receipt)
        assertEquals(1, consumedCalls)
        assertEquals(Step.Decidiendo(preview()), vm.state.value.step)
        assertEquals("compartida.pdf", vm.state.value.stagedFile?.filename)
        assertEquals(listOf("compartida.pdf"), api.previewCalls.map { it.first.filename })
        assertEquals(listOf("compartida.pdf"), stagedCopies().map { it.name })
        assertNull(vm.state.value.sharedFileNotice)
    }

    @Test
    fun `after a finished import the shared file starts a new upload`() = runTest {
        api.onCommitIngesta = { _, _, _ -> commitResult }
        val vm = deciding()
        vm.uploadAsIs()
        assertTrue(vm.state.value.step is Step.Exito)

        val receipt = vm.receive()

        assertEquals(SharedFileReceipt.CONSUMED, receipt)
        assertEquals(1, consumedCalls)
        assertEquals(Step.Decidiendo(preview()), vm.state.value.step)
        assertEquals("compartida.pdf", vm.state.value.stagedFile?.filename)
        assertEquals(listOf("cartola.pdf", "compartida.pdf"), api.previewCalls.map { it.first.filename })
        assertEquals(listOf("compartida.pdf"), stagedCopies().map { it.name })
    }

    @Test
    fun `with the consent pending the file waits and accepting previews it`() = runTest {
        api.onPreviewIngesta = { _, _ -> preview() }
        val vm = waitingForConsent()

        val receipt = vm.receive()

        assertEquals(SharedFileReceipt.CONSUMED, receipt)
        assertEquals(1, consumedCalls)
        assertEquals(Step.Consentimiento(), vm.state.value.step)
        assertEquals("compartida.pdf", vm.state.value.stagedFile?.filename)
        assertEquals(0, api.previewCalls.size)
        assertEquals(1, stagedCopies().size)

        vm.acceptConsent()

        assertEquals(1, api.aceptarConsentimientoCalls)
        assertEquals(Step.Decidiendo(preview()), vm.state.value.step)
        assertEquals(listOf("compartida.pdf"), api.previewCalls.map { it.first.filename })
    }

    @Test
    fun `with the consent pending declining deletes the waiting file`() = runTest {
        val vm = waitingForConsent()
        vm.receive()

        vm.declineConsent()

        assertEquals(Step.Consentimiento(dismissed = true), vm.state.value.step)
        assertNull(vm.state.value.stagedFile)
        assertEquals(emptyList<Any>(), stagedCopies())
        assertEquals(0, api.previewCalls.size)
    }

    @Test
    fun `after not now a shared file reopens the consent and waits for it`() = runTest {
        val vm = waitingForConsent()
        vm.declineConsent()

        val receipt = vm.receive()

        assertEquals(SharedFileReceipt.CONSUMED, receipt)
        assertEquals(Step.Consentimiento(), vm.state.value.step)
        assertEquals("compartida.pdf", vm.state.value.stagedFile?.filename)
        assertEquals(1, stagedCopies().size)
    }

    @Test
    fun `a file waiting after a 409 is replaced by the shared one`() = runTest {
        api.onConsentimientos = { Consentimientos(cartolasVigente = true) }
        api.onPreviewIngesta = { _, _ -> throw IngestaException.ConsentRequired() }
        val vm = started()
        vm.chooseFile(FakeSource("vieja.pdf"))
        assertEquals(Step.Consentimiento(), vm.state.value.step)

        vm.receive()

        assertEquals("compartida.pdf", vm.state.value.stagedFile?.filename)
        assertEquals(listOf("compartida.pdf"), stagedCopies().map { it.name })
    }

    @Test
    fun `while the flow is busy the shared file is ignored with a notice`() = runTest {
        val busy = listOf<suspend () -> SubirCartolaViewModel>(
            { deciding() },
            { reviewing() },
            {
                api.onCommitIngesta = { _, _, _ -> throw IOException("offline") }
                deciding().also { it.uploadAsIs() }
            },
        )
        for (make in busy) {
            consumedCalls = 0
            val vm = make()
            val before = vm.state.value
            val copies = stagedCopies()
            val previews = api.previewCalls.size

            val receipt = vm.receive()

            assertEquals(SharedFileReceipt.CONSUMED, receipt)
            assertEquals(1, consumedCalls)
            assertEquals(before.step, vm.state.value.step)
            assertEquals(before.stagedFile, vm.state.value.stagedFile)
            assertEquals(copies, stagedCopies())
            assertEquals(previews, api.previewCalls.size)
            assertEquals(SubirCartolaMessages.SHARED_FILE_BUSY, vm.state.value.sharedFileNotice)
            assertEquals(
                "Termina o descarta la cartola en curso para subir la que compartiste.",
                SubirCartolaMessages.SHARED_FILE_BUSY,
            )

            vm.dismissSharedFileNotice()
            assertNull(vm.state.value.sharedFileNotice)
            vm.discard()
        }
        assertTrue(api.commitCalls.isNotEmpty())
    }

    @Test
    fun `an import error is a busy step`() = runTest {
        api.onCommitIngesta = { _, _, _ -> throw IOException("offline") }
        val vm = deciding()
        vm.uploadAsIs()
        assertEquals(Step.ErrorImportacion(ImportFailure.Connection, canReturnToReview = false), vm.state.value.step)

        vm.receive()

        assertEquals(Step.ErrorImportacion(ImportFailure.Connection, canReturnToReview = false), vm.state.value.step)
        assertEquals(SubirCartolaMessages.SHARED_FILE_BUSY, vm.state.value.sharedFileNotice)
    }

    @Test
    fun `before the consent check the file stays pending`() = runTest {
        val vm = viewModel()

        val receipt = vm.receive()

        assertEquals(SharedFileReceipt.PENDING, receipt)
        assertEquals(0, consumedCalls)
        assertEquals(Step.Preparando, vm.state.value.step)
        assertNull(vm.state.value.stagedFile)
        assertEquals(emptyList<Any>(), stagedCopies())
        assertEquals(0, api.consentimientosCalls)
    }

    @Test
    fun `a refused shared file shows the same message as the picker`() = runTest {
        val vm = started()

        val receipt = vm.receive("foto.jpg")

        assertEquals(SharedFileReceipt.CONSUMED, receipt)
        assertEquals(Step.Inicial(SubirCartolaMessages.fileProblem(CartolaFileProblem.UNSUPPORTED_EXTENSION)), vm.state.value.step)
        assertNull(vm.state.value.stagedFile)
        assertEquals(emptyList<Any>(), stagedCopies())
        assertEquals(0, api.previewCalls.size)
    }

    @Test
    fun `a refused shared file during the consent keeps the consent and says why`() = runTest {
        val vm = waitingForConsent()

        val receipt = vm.receiveSharedFile(FakeSource("grande.pdf", ByteArray(10 * 1024 * 1024 + 1))) { consumedCalls++ }

        assertEquals(SharedFileReceipt.CONSUMED, receipt)
        assertEquals(1, consumedCalls)
        assertEquals(Step.Consentimiento(), vm.state.value.step)
        assertNull(vm.state.value.stagedFile)
        assertEquals(emptyList<Any>(), stagedCopies())
        assertEquals(SubirCartolaMessages.fileProblem(CartolaFileProblem.TOO_LARGE), vm.state.value.sharedFileNotice)
    }

    @Test
    fun `picking a file after a finished import is still ignored`() = runTest {
        api.onCommitIngesta = { _, _, _ -> commitResult }
        val vm = deciding()
        vm.uploadAsIs()
        val done = vm.state.value

        vm.chooseFile(FakeSource("otra.pdf"))

        assertEquals(done.step, vm.state.value.step)
        assertEquals(1, api.previewCalls.size)
    }
}
