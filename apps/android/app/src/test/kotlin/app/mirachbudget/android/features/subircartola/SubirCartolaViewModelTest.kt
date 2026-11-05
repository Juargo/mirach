package app.mirachbudget.android.features.subircartola

import app.mirachbudget.android.core.networking.ApiException
import app.mirachbudget.android.core.networking.CartolaEdit
import app.mirachbudget.android.core.networking.Consentimientos
import app.mirachbudget.android.core.networking.IngestaException
import app.mirachbudget.android.core.networking.SessionExpiredException
import app.mirachbudget.android.features.subircartola.SubirCartolaSamples.catalogo
import app.mirachbudget.android.features.subircartola.SubirCartolaSamples.commitResult
import app.mirachbudget.android.features.subircartola.SubirCartolaSamples.preview
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.CatalogState
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.ImportFailure
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.ImportSummary
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.PreviewFailure
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.Step
import java.io.IOException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SubirCartolaViewModelTest : SubirCartolaTestBase() {
    // --- consent (S2)

    @Test
    fun `opens on the initial screen when the cartolas consent is in force`() = runTest {
        val vm = viewModel()
        assertEquals(Step.Preparando, vm.state.value.step)

        vm.start()

        assertEquals(Step.Inicial(null), vm.state.value.step)
        assertEquals(1, api.consentimientosCalls)
        assertEquals(0, api.aceptarConsentimientoCalls)
    }

    @Test
    fun `shows the consent first when it is not in force`() = runTest {
        api.onConsentimientos = { Consentimientos(cartolasVigente = false) }
        val vm = viewModel()

        vm.start()

        assertEquals(Step.Consentimiento(), vm.state.value.step)
        assertEquals(1, api.consentimientosCalls)
    }

    @Test
    fun `a failed consent check does not block the upload`() = runTest {
        api.onConsentimientos = { throw IOException("offline") }
        val vm = viewModel()

        vm.start()

        assertEquals(Step.Inicial(null), vm.state.value.step)
    }

    @Test
    fun `accepting the consent sends it and opens the initial screen`() = runTest {
        api.onConsentimientos = { Consentimientos(cartolasVigente = false) }
        val vm = viewModel()
        vm.start()

        vm.acceptConsent()

        assertEquals(1, api.aceptarConsentimientoCalls)
        assertEquals(Step.Inicial(null), vm.state.value.step)
        assertEquals(0, api.previewCalls.size)
    }

    @Test
    fun `a failed acceptance keeps the consent screen with its message`() = runTest {
        api.onConsentimientos = { Consentimientos(cartolasVigente = false) }
        api.onAceptarConsentimientoCartolas = { throw ApiException(500) }
        val vm = viewModel()
        vm.start()

        vm.acceptConsent()

        assertEquals(Step.Consentimiento(failed = true), vm.state.value.step)
        assertEquals(1, api.aceptarConsentimientoCalls)
        assertEquals(
            "No pudimos guardar tu aceptación. Inténtalo de nuevo.",
            SubirCartolaMessages.CONSENT_ACCEPT_FAILED,
        )
    }

    @Test
    fun `not now leaves a blocked consent that can be reopened and blocks picking a file`() = runTest {
        api.onConsentimientos = { Consentimientos(cartolasVigente = false) }
        val vm = viewModel()
        vm.start()

        vm.declineConsent()
        assertEquals(Step.Consentimiento(dismissed = true), vm.state.value.step)

        vm.chooseFile(FakeSource("cartola.pdf"))
        assertEquals(Step.Consentimiento(dismissed = true), vm.state.value.step)
        assertEquals(emptyList<Any>(), stagedCopies())
        assertEquals(0, api.previewCalls.size)

        vm.showConsent()
        assertEquals(Step.Consentimiento(), vm.state.value.step)
        assertEquals(0, api.aceptarConsentimientoCalls)
    }

    @Test
    fun `a consent required on preview shows the consent and, once accepted, previews the same file and password again`() =
        runTest {
            var calls = 0
            api.onPreviewIngesta = { _, _ ->
                calls++
                when (calls) {
                    1 -> throw IngestaException.PasswordRequired()
                    2 -> throw IngestaException.ConsentRequired()
                    else -> preview()
                }
            }
            val vm = started()
            vm.chooseFile(FakeSource("cartola.pdf"))
            vm.submitPassword("1234")

            assertEquals(Step.Consentimiento(), vm.state.value.step)
            assertEquals(1, stagedCopies().size)

            vm.acceptConsent()

            assertEquals(1, api.aceptarConsentimientoCalls)
            assertEquals(Step.Decidiendo(preview()), vm.state.value.step)
            assertEquals(listOf(null, "1234", "1234"), api.previewCalls.map { it.second })
            assertEquals(1, api.previewCalls.map { it.first }.distinct().size)
        }

    @Test
    fun `a consent required on commit shows the consent and, once accepted, previews again`() = runTest {
        api.onCommitIngesta = { _, _, _ -> throw IngestaException.ConsentRequired() }
        val vm = deciding()

        vm.uploadAsIs()

        assertEquals(Step.Consentimiento(), vm.state.value.step)
        assertEquals(1, stagedCopies().size)
        assertEquals(0, vm.state.value.importsCompleted)

        vm.acceptConsent()

        assertEquals(Step.Decidiendo(preview()), vm.state.value.step)
        assertEquals(2, api.previewCalls.size)
        assertEquals(api.commitCalls.single().first, api.previewCalls.last().first)
    }

    @Test
    fun `not now after a consent required mid-flow deletes the staged copy`() = runTest {
        api.onPreviewIngesta = { _, _ -> throw IngestaException.ConsentRequired() }
        val vm = started()
        vm.chooseFile(FakeSource("cartola.pdf"))
        assertEquals(1, stagedCopies().size)

        vm.declineConsent()

        assertEquals(Step.Consentimiento(dismissed = true), vm.state.value.step)
        assertEquals(emptyList<Any>(), stagedCopies())
        assertNull(vm.state.value.stagedFile)
    }

    // --- choosing and previewing (S1)

    @Test
    fun `choosing a file stages it, previews it and loads the catalog`() = runTest {
        api.onPreviewIngesta = { _, _ -> preview() }
        val vm = started()

        vm.chooseFile(FakeSource("cartola enero.pdf", byteArrayOf(1, 2, 3)))

        val state = vm.state.value
        assertEquals(Step.Decidiendo(preview()), state.step)
        assertEquals(CatalogState.Loaded(catalogo), state.catalog)
        assertEquals(1, api.categoriasCalls)
        val sent = api.previewCalls.single()
        assertEquals("cartola enero.pdf", sent.first.filename)
        assertNull(sent.second)
        assertEquals(sent.first, state.stagedFile)
        assertEquals(listOf(sent.first.file), stagedCopies())
    }

    @Test
    fun `a file with another extension is refused before any call`() = runTest {
        val vm = started()

        vm.chooseFile(FakeSource("cartola.csv"))

        assertEquals(Step.Inicial("Elige un archivo .xlsx o .pdf."), vm.state.value.step)
        assertEquals(0, api.previewCalls.size)
        assertEquals(emptyList<Any>(), stagedCopies())
    }

    @Test
    fun `a file over 10 MB is refused before any call`() = runTest {
        val vm = started()

        vm.chooseFile(FakeSource("cartola.pdf", ByteArray(10 * 1024 * 1024 + 1)))

        assertEquals(Step.Inicial("El archivo pesa más de 10 MB. Elige uno más pequeño."), vm.state.value.step)
        assertEquals(0, api.previewCalls.size)
        assertEquals(emptyList<Any>(), stagedCopies())
    }

    @Test
    fun `an unreadable file is refused before any call`() = runTest {
        val vm = started()
        val broken = object : app.mirachbudget.android.core.staging.CartolaSource {
            override fun displayName() = "cartola.pdf"
            override fun size() = 10L
            override fun openInputStream() = throw IOException("revoked")
        }

        vm.chooseFile(broken)

        assertEquals(Step.Inicial("No pudimos abrir el archivo. Inténtalo de nuevo."), vm.state.value.step)
        assertEquals(0, api.previewCalls.size)
    }

    @Test
    fun `a protected pdf asks for the password, which is re-sent on preview and commit`() = runTest {
        api.onPreviewIngesta = { _, password -> if (password == null) throw IngestaException.PasswordRequired() else preview() }
        api.onCommitIngesta = { _, _, _ -> commitResult }
        val vm = started()

        vm.chooseFile(FakeSource("cartola.pdf"))
        assertEquals(Step.Protegido("cartola.pdf", incorrect = false), vm.state.value.step)

        vm.submitPassword("1234")
        assertEquals(Step.Decidiendo(preview()), vm.state.value.step)

        vm.uploadAsIs()
        assertEquals(listOf(null, "1234"), api.previewCalls.map { it.second })
        assertEquals("1234", api.commitCalls.single().second)
    }

    @Test
    fun `an empty password is not sent`() = runTest {
        api.onPreviewIngesta = { _, _ -> throw IngestaException.PasswordRequired() }
        val vm = started()
        vm.chooseFile(FakeSource("cartola.pdf"))

        vm.submitPassword("")

        assertEquals(1, api.previewCalls.size)
        assertEquals(Step.Protegido("cartola.pdf", incorrect = false), vm.state.value.step)
    }

    @Test
    fun `a wrong password asks again marked incorrect`() = runTest {
        api.onPreviewIngesta = { _, password ->
            if (password == null) throw IngestaException.PasswordRequired() else throw IngestaException.PasswordIncorrect()
        }
        val vm = started()
        vm.chooseFile(FakeSource("cartola.pdf"))

        vm.submitPassword("mala")

        assertEquals(Step.Protegido("cartola.pdf", incorrect = true), vm.state.value.step)
        assertEquals("La contraseña es incorrecta. Inténtalo de nuevo.", SubirCartolaMessages.passwordPrompt(true))
        assertEquals(
            "Este archivo está protegido. Ingresa su contraseña para continuar.",
            SubirCartolaMessages.passwordPrompt(false),
        )
    }

    @Test
    fun `each preview failure maps to its copy`() = runTest {
        val cases = listOf(
            IngestaException.NoMovements() to "No encontramos movimientos en el archivo",
            IngestaException.Rejected("Banco no reconocido") to "Banco no reconocido",
            IngestaException.Rejected(null) to "No pudimos leer la cartola. Revisa que sea una cartola válida.",
            IngestaException.CatalogUnavailable() to "No se pudo analizar ahora, intenta de nuevo.",
            IngestaException.CatalogIncomplete() to
                "No pudimos importar tu cartola por un problema de tu cuenta. El archivo está bien y no se importó nada.",
            IOException("offline") to "Problema de conexión. Revisa tu conexión e inténtalo de nuevo.",
            IngestaException.ServerFailure() to "No pudimos analizar la cartola. Inténtalo de nuevo en unos segundos.",
            ApiException(418) to "No pudimos analizar la cartola. Inténtalo de nuevo en unos segundos.",
        )
        for ((error, copy) in cases) {
            api.onPreviewIngesta = { _, _ -> throw error }
            val vm = started()

            vm.chooseFile(FakeSource("cartola.pdf"))

            val step = vm.state.value.step
            assertTrue("$error -> $step", step is Step.ErrorPrevia)
            assertEquals("$error", copy, SubirCartolaMessages.previewFailure((step as Step.ErrorPrevia).failure))
            // The copy stays staged: "Reintentar" sends it again.
            assertNotNull(vm.state.value.stagedFile)
            vm.discard()
        }
    }

    @Test
    fun `retrying a failed preview sends the same file again`() = runTest {
        var calls = 0
        api.onPreviewIngesta = { _, _ -> if (calls++ == 0) throw IOException("offline") else preview() }
        val vm = started()
        vm.chooseFile(FakeSource("cartola.pdf"))
        assertEquals(Step.ErrorPrevia(PreviewFailure.Connection), vm.state.value.step)

        vm.retryPreview()

        assertEquals(Step.Decidiendo(preview()), vm.state.value.step)
        assertEquals(1, api.previewCalls.map { it.first }.distinct().size)
        assertEquals(2, api.previewCalls.size)
    }

    @Test
    fun `an unreadable staged copy deletes it and asks for the file again`() = runTest {
        api.onPreviewIngesta = { _, _ -> throw IngestaException.FileUnreadable() }
        val vm = started()

        vm.chooseFile(FakeSource("cartola.pdf"))

        assertEquals(Step.Inicial("No pudimos leer el archivo. Elígelo de nuevo."), vm.state.value.step)
        assertEquals(emptyList<Any>(), stagedCopies())
    }

    @Test
    fun `an expired session during preview drops everything`() = runTest {
        api.onPreviewIngesta = { _, _ -> throw SessionExpiredException() }
        val vm = started()

        vm.chooseFile(FakeSource("cartola.pdf"))

        assertEquals(Step.Inicial(null), vm.state.value.step)
        assertEquals(emptyList<Any>(), stagedCopies())
        assertNull(vm.state.value.stagedFile)
    }

    // --- deciding

    @Test
    fun `a failed catalog still allows uploading as is, and can be retried`() = runTest {
        var fail = true
        api.onCategorias = { if (fail) throw IOException("offline") else catalogo }
        api.onCommitIngesta = { _, _, _ -> commitResult }
        val vm = deciding()
        assertEquals(CatalogState.Failed, vm.state.value.catalog)

        vm.startReview()
        assertEquals(Step.Decidiendo(preview()), vm.state.value.step)

        fail = false
        vm.retryCatalog()
        assertEquals(CatalogState.Loaded(catalogo), vm.state.value.catalog)

        fail = true
        vm.retryCatalog()
        assertEquals(2, api.categoriasCalls)
    }

    @Test
    fun `uploading as is commits without edits, deletes the copy and counts the import`() = runTest {
        api.onCommitIngesta = { _, _, _ -> commitResult }
        val vm = deciding()
        val staged = vm.state.value.stagedFile!!

        vm.uploadAsIs()

        val summary = ImportSummary(banco = "Banco de Chile", totalTransacciones = 4, duplicadosOmitidos = 1)
        assertEquals(Step.Exito(summary), vm.state.value.step)
        assertEquals(Triple(staged, null, emptyList<CartolaEdit>()), api.commitCalls.single())
        assertEquals(1, vm.state.value.importsCompleted)
        assertEquals(emptyList<Any>(), stagedCopies())
        assertNull(vm.state.value.stagedFile)
        assertEquals("4 movimientos importados de Banco de Chile", SubirCartolaMessages.headline(summary))
        assertEquals("1 duplicado omitido", SubirCartolaMessages.duplicatesLine(summary))
    }

    @Test
    fun `upload another cartola goes back to the start and keeps the import count`() = runTest {
        api.onCommitIngesta = { _, _, _ -> commitResult }
        val vm = deciding()
        vm.uploadAsIs()

        vm.discard()

        assertEquals(Step.Inicial(null), vm.state.value.step)
        assertEquals(1, vm.state.value.importsCompleted)
    }

    @Test
    fun `discarding deletes the staged copy and goes back to the start`() = runTest {
        val vm = deciding()
        assertEquals(1, stagedCopies().size)

        vm.discard()

        assertEquals(Step.Inicial(null), vm.state.value.step)
        assertEquals(emptyList<Any>(), stagedCopies())
        assertNull(vm.state.value.stagedFile)
        assertEquals(CatalogState.Loading, vm.state.value.catalog)
    }

    @Test
    fun `discarding all for sign-out deletes every copy and checks the consent again`() = runTest {
        val vm = deciding()
        directory.resolve("leftover").mkdirs()
        directory.resolve("leftover/old.pdf").writeText("old")

        vm.discardAll()

        assertEquals(Step.Preparando, vm.state.value.step)
        assertEquals(emptyList<Any>(), stagedCopies())
        assertNull(vm.state.value.stagedFile)

        vm.start()
        assertEquals(2, api.consentimientosCalls)
    }

    // --- importing

    @Test
    fun `each import failure maps to its copy and retryability`() = runTest {
        val cases = listOf(
            Triple(IngestaException.CatalogIncomplete(), ImportFailure.AccountProblem, false),
            Triple(IngestaException.CatalogUnavailable(), ImportFailure.TemporarilyUnavailable, true),
            Triple(IOException("offline"), ImportFailure.Connection, true),
            Triple(IngestaException.ServerFailure(), ImportFailure.Server, true),
        )
        for ((error, failure, retryable) in cases) {
            api.onCommitIngesta = { _, _, _ -> throw error }
            val vm = deciding()

            vm.uploadAsIs()

            assertEquals("$error", Step.ErrorImportacion(failure, canReturnToReview = false), vm.state.value.step)
            assertEquals(retryable, failure.isRetryable)
            assertEquals(1, stagedCopies().size)
            assertEquals(0, vm.state.value.importsCompleted)
            vm.discard()
        }
        assertEquals(
            "No pudimos importar tu cartola por un problema de tu cuenta. El archivo está bien y no se importó nada.",
            SubirCartolaMessages.importFailure(ImportFailure.AccountProblem),
        )
        assertEquals(
            "No se pudo importar ahora, intenta de nuevo. No se guardó nada.",
            SubirCartolaMessages.importFailure(ImportFailure.TemporarilyUnavailable),
        )
        assertEquals(
            "Problema de conexión. No se guardó nada; revisa tu conexión e inténtalo de nuevo.",
            SubirCartolaMessages.importFailure(ImportFailure.Connection),
        )
        assertEquals(
            "No pudimos importar la cartola. No se guardó nada; inténtalo de nuevo.",
            SubirCartolaMessages.importFailure(ImportFailure.Server),
        )
    }

    @Test
    fun `a rejected or unreadable commit goes back to the start with its message and deletes the copy`() = runTest {
        val cases = listOf(
            IngestaException.Rejected("Estructura no válida") to "Estructura no válida",
            IngestaException.Rejected(null) to "No pudimos leer la cartola. Revisa que sea una cartola válida.",
            IngestaException.NoMovements() to "No encontramos movimientos en el archivo",
            IngestaException.FileUnreadable() to "No pudimos leer el archivo. Elígelo de nuevo.",
        )
        for ((error, copy) in cases) {
            api.onCommitIngesta = { _, _, _ -> throw error }
            val vm = deciding()

            vm.uploadAsIs()

            assertEquals("$error", Step.Inicial(copy), vm.state.value.step)
            assertEquals(emptyList<Any>(), stagedCopies())
        }
    }

    @Test
    fun `retrying a failed import sends the same file, password and edits again`() = runTest {
        var calls = 0
        api.onCommitIngesta = { _, _, _ -> if (calls++ == 0) throw IOException("offline") else commitResult }
        val vm = reviewing()
        vm.choose("cat-resto", 0)
        vm.confirm()
        assertEquals(Step.ErrorImportacion(ImportFailure.Connection, canReturnToReview = true), vm.state.value.step)

        vm.retryImport()

        assertEquals(2, api.commitCalls.size)
        assertEquals(api.commitCalls[0], api.commitCalls[1])
        assertEquals(listOf(CartolaEdit(0, "cat-resto")), api.commitCalls[1].third)
        assertTrue(vm.state.value.step is Step.Exito)
    }

    @Test
    fun `an account problem cannot be retried`() = runTest {
        api.onCommitIngesta = { _, _, _ -> throw IngestaException.CatalogIncomplete() }
        val vm = deciding()
        vm.uploadAsIs()

        vm.retryImport()

        assertEquals(1, api.commitCalls.size)
    }

    @Test
    fun `back to review keeps the edits after a failed import from the review`() = runTest {
        api.onCommitIngesta = { _, _, _ -> throw IngestaException.ServerFailure() }
        val vm = reviewing()
        vm.choose("cat-resto", 0)
        vm.confirm()

        vm.backToReview()

        assertEquals(Step.Revisando(preview()), vm.state.value.step)
        assertEquals(mapOf(0 to "cat-resto"), vm.state.value.edits)
    }

    @Test
    fun `back to review is not offered after uploading as is`() = runTest {
        api.onCommitIngesta = { _, _, _ -> throw IngestaException.ServerFailure() }
        val vm = deciding()
        vm.uploadAsIs()

        vm.backToReview()

        assertEquals(Step.ErrorImportacion(ImportFailure.Server, canReturnToReview = false), vm.state.value.step)
    }

    @Test
    fun `an expired session during commit drops everything`() = runTest {
        api.onCommitIngesta = { _, _, _ -> throw SessionExpiredException() }
        val vm = deciding()

        vm.uploadAsIs()

        assertEquals(Step.Inicial(null), vm.state.value.step)
        assertEquals(emptyList<Any>(), stagedCopies())
        assertEquals(0, vm.state.value.importsCompleted)
    }
}
