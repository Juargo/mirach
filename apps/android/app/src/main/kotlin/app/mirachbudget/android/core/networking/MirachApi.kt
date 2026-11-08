package app.mirachbudget.android.core.networking

import app.mirachbudget.android.core.staging.CartolaFile
import app.mirachbudget.android.core.session.Session

/** What the first screen shows from the public `GET /version` endpoint. */
data class VersionInfo(val version: String, val commit: String)

/**
 * What screens need from the API. Screens depend on this interface, never on the generated types,
 * so a contract change is absorbed in the adapter. Mirrors `MirachAPI` on iOS; endpoints are added
 * here as the screens that use them are built.
 */
interface MirachApi {
    /** Public `GET /version`: the deployed build of the API. */
    suspend fun version(): VersionInfo

    /** `GET /api/auth/capabilities`: which providers can be offered. Needs only the API key. */
    suspend fun capabilities(): AuthCapabilities

    /**
     * `POST /api/auth/google/token`. Throws [InvalidCredentialsException], [ApiKeyRejectedException],
     * [SignInUnavailableException] (404), [RateLimitedException] or [ApiException].
     */
    suspend fun signInWithGoogle(idToken: String): Session

    /** `POST /api/auth/login` (App Review account, ADR-051). Same errors as Google, minus 404. */
    suspend fun signInWithPassword(email: String, password: String): Session

    /**
     * `GET /api/auth/me`. Throws [SessionExpiredException] on 401 `SESION_INVALIDA` (also reported
     * once through the [SessionExpiryRelay]) and [ApiKeyRejectedException] on `API_KEY_INVALIDA`.
     */
    suspend fun currentUser(): CurrentUser

    /**
     * `PATCH /api/perfil` with only the name; answers the updated identity. Throws
     * [InvalidNameException] for `NOMBRE_INVALIDO`, [SessionExpiredException] on 401.
     */
    suspend fun updateNombre(nombre: String): CurrentUser

    /** `POST /api/auth/logout`: revokes the session on the server. Throws on any failure; the caller signs out locally either way. */
    suspend fun logout()

    /**
     * `DELETE /api/cuenta` with `{"confirmacion": confirmacion}`. Throws [ConfirmationRejectedException]
     * for `CONFIRMACION_INVALIDA` and [SessionExpiredException] on 401.
     */
    suspend fun deleteAccount(confirmacion: String)

    /** `GET /api/resumen`. `null` lets the API resolve the latest month with movements. */
    suspend fun resumen(periodo: Periodo?): ResumenMes

    /** `GET /api/periodos`: months with movements, most recent first. */
    suspend fun periodos(): List<Periodo>

    /**
     * `POST /api/ingestas/preview`: reads the statement and saves nothing. [password] only for a
     * protected PDF (an empty one is not sent). Throws [IngestaException] for the answers the
     * catalog names and [SessionExpiredException] on 401.
     */
    suspend fun previewIngesta(file: CartolaFile, password: String?): CartolaPreview

    /**
     * `POST /api/ingestas/commit`: the API keeps no preview, so the same file and password go again.
     * [edits] holds only the rows the person reclassified. Same errors as [previewIngesta].
     */
    suspend fun commitIngesta(file: CartolaFile, password: String?, edits: List<CartolaEdit>): CartolaCommitResult

    /** `GET /api/categorias`: the user's categories, for naming and changing a row's classification. */
    suspend fun categorias(): CatalogoCategorias

    /** `POST /api/categorias` with at most one «contains» pattern. Throws [CategoriaException] for the 400 and 409 the catalog names. */
    suspend fun crearCategoria(nueva: NuevaCategoria): CategoriaCatalogo

    /** `GET /api/consentimientos`: whether the statement-processing consent is in force. */
    suspend fun consentimientos(): Consentimientos

    /** `POST /api/consentimientos` `{tipo: "cartolas", version: LegalDocuments.VERSION}` (PRI-02). */
    suspend fun aceptarConsentimientoCartolas()

    /**
     * `DELETE /api/consentimientos/cartolas` (PRI-06): new imports are blocked until accepted again.
     * Idempotent on the server. Throws [SessionExpiredException] on 401 and [ApiException] otherwise.
     */
    suspend fun revocarConsentimientoCartolas()

    /** `GET /api/ingestas`: the user's imports, newest first (the server's order is kept). */
    suspend fun cartolasSubidas(): List<CartolaSubida>

    /**
     * `DELETE /api/ingestas/{id}`: deletes the import and its movements. Throws
     * [CartolaNotFoundException] on 404 and [SessionExpiredException] on 401.
     */
    suspend fun eliminarCartola(id: String)

    /** `GET /api/buckets/{bucket}/detalle?periodo`: the bucket's month, grouped by category. */
    suspend fun bucketDetalle(bucket: Bucket, periodo: Periodo): BucketDetalle

    /**
     * `PATCH /api/transacciones/{id}/categoria`; the movement becomes a manual classification.
     * [aplicarAParecidos] also saves the suggested pattern and moves the month's coinciding movements
     * (CLA-03). Throws [ReclasificarException] for 400 and 404.
     */
    suspend fun reclasificar(transaccionId: String, categoriaId: String, aplicarAParecidos: Periodo? = null): Reclasificacion

    /** `GET /api/transacciones/{id}/parecidos`: what «Aplicar a …» would do. Throws [ReclasificarException] for 404. */
    suspend fun parecidos(transaccionId: String, categoriaId: String, periodo: Periodo): Parecidos

    /** `PATCH /api/categorias/{id}` with only what changed. Throws [CategoriaException], including [CategoriaException.NotFound] and [CategoriaException.IsInternal]. */
    suspend fun actualizarCategoria(id: String, cambios: CategoriaCambios): CategoriaCatalogo

    /** `DELETE /api/categorias/{id}`: its movements go to «Desconocido». Throws [CategoriaException.NotFound] or [CategoriaException.IsInternal]. */
    suspend fun eliminarCategoria(id: String)

    /**
     * `POST /api/patrones`, always «contains» (CLA-14). [moverDelPeriodo] also moves that month's
     * coinciding movements (CLA-15). Throws [PatronException].
     */
    suspend fun crearPatron(categoriaId: String, patron: String, moverDelPeriodo: Periodo?): PatronCreado

    /** `POST /api/patrones/vista-previa` without a month: the API uses the latest month with data. Throws [PatronException]. */
    suspend fun vistaPreviaPatron(categoriaId: String, patron: String): VistaPreviaPatron

    /** `PATCH /api/patrones/{id}` with only what changed; moving it moves no movements. Throws [PatronException]. */
    suspend fun actualizarPatron(id: String, cambios: PatronCambios): PatronCategoria

    /** `DELETE /api/patrones/{id}`. Throws [PatronException.PatternNotFound] on 404. */
    suspend fun eliminarPatron(id: String)
}

/** The server answered with a non-2xx status. */
class ApiException(val status: Int) : Exception("HTTP $status")
