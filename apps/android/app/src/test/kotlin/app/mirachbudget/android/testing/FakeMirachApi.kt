package app.mirachbudget.android.testing

import app.mirachbudget.android.core.staging.CartolaFile
import app.mirachbudget.android.core.networking.AuthCapabilities
import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.BucketDetalle
import app.mirachbudget.android.core.networking.CategoriaCambios
import app.mirachbudget.android.core.networking.Parecidos
import app.mirachbudget.android.core.networking.PatronCambios
import app.mirachbudget.android.core.networking.PatronCategoria
import app.mirachbudget.android.core.networking.PatronCreado
import app.mirachbudget.android.core.networking.Reclasificacion
import app.mirachbudget.android.core.networking.VistaPreviaPatron
import app.mirachbudget.android.core.networking.CartolaCommitResult
import app.mirachbudget.android.core.networking.CartolaEdit
import app.mirachbudget.android.core.networking.CartolaPreview
import app.mirachbudget.android.core.networking.CartolaSubida
import app.mirachbudget.android.core.networking.CatalogoCategorias
import app.mirachbudget.android.core.networking.CategoriaCatalogo
import app.mirachbudget.android.core.networking.Consentimientos
import app.mirachbudget.android.core.networking.CurrentUser
import app.mirachbudget.android.core.networking.MirachApi
import app.mirachbudget.android.core.networking.NuevaCategoria
import app.mirachbudget.android.core.networking.Periodo
import app.mirachbudget.android.core.networking.ResumenMes
import app.mirachbudget.android.core.networking.VersionInfo
import app.mirachbudget.android.core.session.Session

/** Scriptable [MirachApi]: each endpoint runs the lambda a test assigns; unscripted calls fail loudly. */
class FakeMirachApi : MirachApi {
    var onVersion: suspend () -> VersionInfo = { error("version() not scripted") }
    var onCapabilities: suspend () -> AuthCapabilities = { error("capabilities() not scripted") }
    var onGoogle: suspend (String) -> Session = { error("signInWithGoogle() not scripted") }
    var onPassword: suspend (String, String) -> Session = { _, _ -> error("signInWithPassword() not scripted") }
    var onCurrentUser: suspend () -> CurrentUser = { error("currentUser() not scripted") }

    var onResumen: suspend (Periodo?) -> ResumenMes = { error("resumen() not scripted") }
    var onPeriodos: suspend () -> List<Periodo> = { error("periodos() not scripted") }

    var onUpdateNombre: suspend (String) -> CurrentUser = { error("updateNombre() not scripted") }
    var onLogout: suspend () -> Unit = {}
    var onDeleteAccount: suspend (String) -> Unit = {}

    var onPreviewIngesta: suspend (CartolaFile, String?) -> CartolaPreview = { _, _ -> error("previewIngesta() not scripted") }
    var onCommitIngesta: suspend (CartolaFile, String?, List<CartolaEdit>) -> CartolaCommitResult =
        { _, _, _ -> error("commitIngesta() not scripted") }
    var onCategorias: suspend () -> CatalogoCategorias = { error("categorias() not scripted") }
    var onCrearCategoria: suspend (NuevaCategoria) -> CategoriaCatalogo = { error("crearCategoria() not scripted") }
    var onConsentimientos: suspend () -> Consentimientos = { error("consentimientos() not scripted") }
    var onAceptarConsentimientoCartolas: suspend () -> Unit = {}
    var onCartolasSubidas: suspend () -> List<CartolaSubida> = { error("cartolasSubidas() not scripted") }
    var onEliminarCartola: suspend (String) -> Unit = {}
    var onBucketDetalle: suspend (Bucket, Periodo) -> BucketDetalle = { _, _ -> error("bucketDetalle() not scripted") }
    var onReclasificar: suspend (String, String, Periodo?) -> Reclasificacion = { _, _, _ -> error("reclasificar() not scripted") }
    var onParecidos: suspend (String, String, Periodo) -> Parecidos = { _, _, _ -> error("parecidos() not scripted") }
    var onActualizarCategoria: suspend (String, CategoriaCambios) -> CategoriaCatalogo =
        { _, _ -> error("actualizarCategoria() not scripted") }
    var onEliminarCategoria: suspend (String) -> Unit = {}
    var onCrearPatron: suspend (String, String, Periodo?) -> PatronCreado = { _, _, _ -> error("crearPatron() not scripted") }
    var onVistaPreviaPatron: suspend (String, String) -> VistaPreviaPatron = { _, _ -> error("vistaPreviaPatron() not scripted") }
    var onActualizarPatron: suspend (String, PatronCambios) -> PatronCategoria = { _, _ -> error("actualizarPatron() not scripted") }
    var onEliminarPatron: suspend (String) -> Unit = {}

    val googleTokens = mutableListOf<String>()
    val passwordAttempts = mutableListOf<Pair<String, String>>()
    var currentUserCalls = 0
    val resumenCalls = mutableListOf<Periodo?>()
    var periodosCalls = 0
    val updateNombreCalls = mutableListOf<String>()
    var logoutCalls = 0
    val deleteCalls = mutableListOf<String>()
    val previewCalls = mutableListOf<Pair<CartolaFile, String?>>()

    /** One entry per commit: the file, the password and the edits, as sent. */
    val commitCalls = mutableListOf<Triple<CartolaFile, String?, List<CartolaEdit>>>()
    var categoriasCalls = 0
    val crearCategoriaCalls = mutableListOf<NuevaCategoria>()
    var consentimientosCalls = 0
    var aceptarConsentimientoCalls = 0
    var cartolasSubidasCalls = 0
    val eliminarCartolaCalls = mutableListOf<String>()
    val bucketDetalleCalls = mutableListOf<Pair<Bucket, Periodo>>()
    /** One entry per call: movement, category and `aplicarAParecidos`, as sent. */
    val reclasificarCalls = mutableListOf<Triple<String, String, Periodo?>>()
    val parecidosCalls = mutableListOf<Triple<String, String, Periodo>>()
    val actualizarCategoriaCalls = mutableListOf<Pair<String, CategoriaCambios>>()
    val eliminarCategoriaCalls = mutableListOf<String>()
    val crearPatronCalls = mutableListOf<Triple<String, String, Periodo?>>()
    val vistaPreviaPatronCalls = mutableListOf<Pair<String, String>>()
    val actualizarPatronCalls = mutableListOf<Pair<String, PatronCambios>>()
    val eliminarPatronCalls = mutableListOf<String>()

    override suspend fun version() = onVersion()
    override suspend fun capabilities() = onCapabilities()
    override suspend fun signInWithGoogle(idToken: String): Session {
        googleTokens += idToken
        return onGoogle(idToken)
    }

    override suspend fun signInWithPassword(email: String, password: String): Session {
        passwordAttempts += email to password
        return onPassword(email, password)
    }

    override suspend fun currentUser(): CurrentUser {
        currentUserCalls++
        return onCurrentUser()
    }

    override suspend fun updateNombre(nombre: String): CurrentUser {
        updateNombreCalls += nombre
        return onUpdateNombre(nombre)
    }

    override suspend fun logout() {
        logoutCalls++
        onLogout()
    }

    override suspend fun deleteAccount(confirmacion: String) {
        deleteCalls += confirmacion
        onDeleteAccount(confirmacion)
    }

    override suspend fun resumen(periodo: Periodo?): ResumenMes {
        resumenCalls += periodo
        return onResumen(periodo)
    }

    override suspend fun periodos(): List<Periodo> {
        periodosCalls++
        return onPeriodos()
    }

    override suspend fun previewIngesta(file: CartolaFile, password: String?): CartolaPreview {
        previewCalls += file to password
        return onPreviewIngesta(file, password)
    }

    override suspend fun commitIngesta(file: CartolaFile, password: String?, edits: List<CartolaEdit>): CartolaCommitResult {
        commitCalls += Triple(file, password, edits)
        return onCommitIngesta(file, password, edits)
    }

    override suspend fun categorias(): CatalogoCategorias {
        categoriasCalls++
        return onCategorias()
    }

    override suspend fun crearCategoria(nueva: NuevaCategoria): CategoriaCatalogo {
        crearCategoriaCalls += nueva
        return onCrearCategoria(nueva)
    }

    override suspend fun consentimientos(): Consentimientos {
        consentimientosCalls++
        return onConsentimientos()
    }

    override suspend fun aceptarConsentimientoCartolas() {
        aceptarConsentimientoCalls++
        onAceptarConsentimientoCartolas()
    }

    override suspend fun cartolasSubidas(): List<CartolaSubida> {
        cartolasSubidasCalls++
        return onCartolasSubidas()
    }

    override suspend fun eliminarCartola(id: String) {
        eliminarCartolaCalls += id
        onEliminarCartola(id)
    }

    override suspend fun bucketDetalle(bucket: Bucket, periodo: Periodo): BucketDetalle {
        bucketDetalleCalls += bucket to periodo
        return onBucketDetalle(bucket, periodo)
    }

    override suspend fun reclasificar(transaccionId: String, categoriaId: String, aplicarAParecidos: Periodo?): Reclasificacion {
        reclasificarCalls += Triple(transaccionId, categoriaId, aplicarAParecidos)
        return onReclasificar(transaccionId, categoriaId, aplicarAParecidos)
    }

    override suspend fun parecidos(transaccionId: String, categoriaId: String, periodo: Periodo): Parecidos {
        parecidosCalls += Triple(transaccionId, categoriaId, periodo)
        return onParecidos(transaccionId, categoriaId, periodo)
    }

    override suspend fun actualizarCategoria(id: String, cambios: CategoriaCambios): CategoriaCatalogo {
        actualizarCategoriaCalls += id to cambios
        return onActualizarCategoria(id, cambios)
    }

    override suspend fun eliminarCategoria(id: String) {
        eliminarCategoriaCalls += id
        onEliminarCategoria(id)
    }

    override suspend fun crearPatron(categoriaId: String, patron: String, moverDelPeriodo: Periodo?): PatronCreado {
        crearPatronCalls += Triple(categoriaId, patron, moverDelPeriodo)
        return onCrearPatron(categoriaId, patron, moverDelPeriodo)
    }

    override suspend fun vistaPreviaPatron(categoriaId: String, patron: String): VistaPreviaPatron {
        vistaPreviaPatronCalls += categoriaId to patron
        return onVistaPreviaPatron(categoriaId, patron)
    }

    override suspend fun actualizarPatron(id: String, cambios: PatronCambios): PatronCategoria {
        actualizarPatronCalls += id to cambios
        return onActualizarPatron(id, cambios)
    }

    override suspend fun eliminarPatron(id: String) {
        eliminarPatronCalls += id
        onEliminarPatron(id)
    }
}
