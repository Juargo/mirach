package app.mirachbudget.android.core.networking

import app.mirachbudget.android.core.staging.CartolaFile
import app.mirachbudget.android.core.api.generated.apis.DefaultApi
import app.mirachbudget.android.core.api.generated.models.ApiAuthGoogleTokenPostRequest
import app.mirachbudget.android.core.api.generated.models.ApiAuthLoginPostRequest
import app.mirachbudget.android.core.api.generated.models.ApiCategoriasIdPatchRequest
import app.mirachbudget.android.core.api.generated.models.ApiPatronesIdPatchRequest
import app.mirachbudget.android.core.api.generated.models.ApiPatronesPostRequest
import app.mirachbudget.android.core.api.generated.models.ApiPatronesVistaPreviaPostRequest
import app.mirachbudget.android.core.api.generated.models.ApiTransaccionesIdCategoriaPatchRequest
import app.mirachbudget.android.core.api.generated.models.ApiTransaccionesIdCategoriaPatchRequestAplicarAParecidos
import app.mirachbudget.android.core.api.generated.models.PatronResponse
import app.mirachbudget.android.core.api.generated.models.ApiCategoriasPostRequest
import app.mirachbudget.android.core.api.generated.models.ApiCategoriasPostRequestPatronesInner
import app.mirachbudget.android.core.api.generated.models.ApiConsentimientosGet200ResponseConsentimientosInner
import app.mirachbudget.android.core.api.generated.models.ApiConsentimientosPostRequest
import app.mirachbudget.android.core.api.generated.models.ApiCuentaDeleteRequest
import app.mirachbudget.android.core.api.generated.models.ApiPerfilPatchRequest
import app.mirachbudget.android.core.api.generated.models.AuthLoginResponse
import app.mirachbudget.android.core.session.Session
import java.io.IOException
import java.time.Instant
import java.time.format.DateTimeParseException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.Response

/**
 * [MirachApi] over the generated Retrofit client. It translates responses into app types and
 * deliberately catches no I/O: timeouts, I/O and decoding failures reach the caller as they are,
 * and a coroutine cancellation stays a `CancellationException` (never mapped to an error).
 *
 * [onSessionExpired] receives the token that was rejected whenever an authenticated call gets 401
 * `SESION_INVALIDA`: the single place that notices an expired session, so no screen has to
 * remember to handle it. The token is read when the call starts, so a late answer is attributed to
 * the session it was sent with.
 */
class GeneratedMirachApi(
    private val api: DefaultApi,
    private val cuenta: CuentaApi,
    private val tokenProvider: AuthTokenProvider = AuthTokenProvider.None,
    private val onSessionExpired: (String) -> Unit = {},
) : MirachApi {
    override suspend fun version(): VersionInfo {
        val response = api.versionGet()
        if (!response.isSuccessful) throw ApiException(response.code())
        val body = response.body() ?: throw SerializationException("Empty body for GET /version")
        return VersionInfo(version = body.version, commit = body.commit)
    }

    override suspend fun capabilities(): AuthCapabilities {
        val response = api.apiAuthCapabilitiesGet()
        if (response.code() == 401) throw rejectedKey(response)
        val body = response.bodyOrThrow("GET /api/auth/capabilities")
        return AuthCapabilities(
            googleLoginEnabled = body.googleLoginMobileEnabled,
            passwordLoginEnabled = body.passwordLoginEnabled,
        )
    }

    override suspend fun signInWithGoogle(idToken: String): Session =
        toSession(
            api.apiAuthGoogleTokenPost(
                ApiAuthGoogleTokenPostRequest(
                    idToken = idToken,
                    versionPrivacidad = LegalDocuments.VERSION,
                    versionTerminos = LegalDocuments.VERSION,
                ),
            ),
            providerSwitchedOff404 = true,
        )

    override suspend fun signInWithPassword(email: String, password: String): Session =
        toSession(api.apiAuthLoginPost(ApiAuthLoginPostRequest(email = email, password = password)), providerSwitchedOff404 = false)

    override suspend fun currentUser(): CurrentUser {
        val sentToken = tokenProvider.token()
        val response = api.apiAuthMeGet()
        if (response.code() == 401) throw rejection(response, sentToken)
        val me = response.bodyOrThrow("GET /api/auth/me")
        return CurrentUser(userId = me.userId, nombre = me.nombre, email = me.email)
    }

    override suspend fun updateNombre(nombre: String): CurrentUser {
        val sentToken = tokenProvider.token()
        // Only the name: `email` needs the current password and the app never changes it.
        val response = api.apiPerfilPatch(ApiPerfilPatchRequest(nombre = nombre))
        when (response.code()) {
            400 -> throw if (errorCode(response) == "NOMBRE_INVALIDO") InvalidNameException() else ApiException(400)
            401 -> throw rejection(response, sentToken)
        }
        val me = response.bodyOrThrow("PATCH /api/perfil")
        return CurrentUser(userId = me.userId, nombre = me.nombre, email = me.email)
    }

    override suspend fun logout() {
        val response = api.apiAuthLogoutPost()
        // Public endpoint: its only 401 is the client key.
        if (response.code() == 401) throw rejectedKey(response)
        if (!response.isSuccessful) throw ApiException(response.code())
    }

    override suspend fun deleteAccount(confirmacion: String) {
        val sentToken = tokenProvider.token()
        val response = cuenta.apiCuentaDelete(ApiCuentaDeleteRequest(confirmacion = confirmacion))
        when (response.code()) {
            400 -> throw if (errorCode(response) == "CONFIRMACION_INVALIDA") ConfirmationRejectedException() else ApiException(400)
            401 -> throw rejection(response, sentToken)
        }
        if (!response.isSuccessful) throw ApiException(response.code())
    }

    override suspend fun resumen(periodo: Periodo?): ResumenMes {
        val sentToken = tokenProvider.token()
        val response = api.apiResumenGet(periodo?.apiValue)
        if (response.code() == 401) throw rejection(response, sentToken)
        return ResumenMapper.map(response.bodyOrThrow("GET /api/resumen"))
    }

    override suspend fun periodos(): List<Periodo> {
        val sentToken = tokenProvider.token()
        val response = api.apiPeriodosGet()
        if (response.code() == 401) throw rejection(response, sentToken)
        return response.bodyOrThrow("GET /api/periodos").periodos.map(ResumenMapper::periodo)
    }

    override suspend fun previewIngesta(file: CartolaFile, password: String?): CartolaPreview {
        val sentToken = tokenProvider.token()
        val part = filePart(file)
        val response = api.apiIngestasPreviewPost(part, password = password?.takeIf { it.isNotEmpty() })
        ingestaFailure(response, sentToken)?.let { throw it }
        return IngestaMapper.preview(response.bodyOrThrow("POST /api/ingestas/preview"))
    }

    override suspend fun commitIngesta(file: CartolaFile, password: String?, edits: List<CartolaEdit>): CartolaCommitResult {
        val sentToken = tokenProvider.token()
        val part = filePart(file)
        val response = api.apiIngestasCommitPost(
            part,
            edits = IngestaMapper.editsJson(edits),
            password = password?.takeIf { it.isNotEmpty() },
        )
        ingestaFailure(response, sentToken)?.let { throw it }
        val result = response.bodyOrThrow("POST /api/ingestas/commit")
        return CartolaCommitResult(
            ingestaId = result.ingestaId,
            totalTransacciones = result.totalTransacciones,
            duplicadosOmitidos = result.duplicadosOmitidos,
        )
    }

    override suspend fun categorias(): CatalogoCategorias {
        val sentToken = tokenProvider.token()
        val response = api.apiCategoriasGet()
        if (response.code() == 401) throw rejection(response, sentToken)
        return IngestaMapper.catalog(response.bodyOrThrow("GET /api/categorias"))
    }

    override suspend fun crearCategoria(nueva: NuevaCategoria): CategoriaCatalogo {
        val sentToken = tokenProvider.token()
        val patron = nueva.patron?.trim().orEmpty()
        val response = api.apiCategoriasPost(
            ApiCategoriasPostRequest(
                bucket = nueva.bucket.apiName,
                nombre = nueva.nombre,
                icono = nueva.icono,
                // The simplest match type; the form never sends a priority.
                patrones = if (patron.isEmpty()) null else listOf(ApiCategoriasPostRequestPatronesInner("CONTAINS", patron)),
            ),
        )
        when (response.code()) {
            400, 409 -> throw categoriaFailure(response)
            401 -> throw rejection(response, sentToken)
        }
        val created = response.bodyOrThrow("POST /api/categorias")
        return IngestaMapper.category(created) ?: throw IngestaMapper.malformed("bucket ${created.bucket}")
    }

    override suspend fun consentimientos(): Consentimientos {
        val sentToken = tokenProvider.token()
        val response = api.apiConsentimientosGet()
        if (response.code() == 401) throw rejection(response, sentToken)
        val list = response.bodyOrThrow("GET /api/consentimientos").consentimientos
        return Consentimientos(
            cartolasVigente = list.any {
                it.tipo == ApiConsentimientosGet200ResponseConsentimientosInner.Tipo.cartolas && it.revocadoEn == null
            },
        )
    }

    override suspend fun aceptarConsentimientoCartolas() {
        val sentToken = tokenProvider.token()
        val response = api.apiConsentimientosPost(
            ApiConsentimientosPostRequest(tipo = ApiConsentimientosPostRequest.Tipo.cartolas, version = LegalDocuments.VERSION),
        )
        if (response.code() == 401) throw rejection(response, sentToken)
        if (!response.isSuccessful) throw ApiException(response.code())
    }

    override suspend fun revocarConsentimientoCartolas() {
        val sentToken = tokenProvider.token()
        val response = api.apiConsentimientosTipoDelete(DefaultApi.TipoApiConsentimientosTipoDelete.cartolas.value)
        if (response.code() == 401) throw rejection(response, sentToken)
        if (!response.isSuccessful) throw ApiException(response.code())
    }

    override suspend fun cartolasSubidas(): List<CartolaSubida> {
        val sentToken = tokenProvider.token()
        val response = api.apiIngestasGet()
        if (response.code() == 401) throw rejection(response, sentToken)
        return CartolasSubidasMapper.map(response.bodyOrThrow("GET /api/ingestas"))
    }

    override suspend fun eliminarCartola(id: String) {
        val sentToken = tokenProvider.token()
        val response = api.apiIngestasIdDelete(id)
        when (response.code()) {
            401 -> throw rejection(response, sentToken)
            404 -> throw CartolaNotFoundException()
        }
        if (!response.isSuccessful) throw ApiException(response.code())
    }

    override suspend fun bucketDetalle(bucket: Bucket, periodo: Periodo): BucketDetalle {
        val sentToken = tokenProvider.token()
        val response = api.apiBucketsBucketDetalleGet(bucket.apiName, periodo.apiValue)
        // 400 means a bucket or month the app built itself is wrong: a bug, not a user error.
        if (response.code() == 401) throw rejection(response, sentToken)
        return BucketDetalleMapper.detalle(response.bodyOrThrow("GET /api/buckets/{bucket}/detalle"))
    }

    override suspend fun reclasificar(transaccionId: String, categoriaId: String, aplicarAParecidos: Periodo?): Reclasificacion {
        val sentToken = tokenProvider.token()
        val response = api.apiTransaccionesIdCategoriaPatch(
            transaccionId,
            ApiTransaccionesIdCategoriaPatchRequest(
                categoriaId = categoriaId,
                aplicarAParecidos = aplicarAParecidos?.let { ApiTransaccionesIdCategoriaPatchRequestAplicarAParecidos(it.apiValue) },
            ),
        )
        when (response.code()) {
            // The 400 has no documented body; the app only applies a suggestion the API made, so
            // the one it can provoke is a category deleted meanwhile.
            400 -> throw ReclasificarException.CategoryNotFound()
            401 -> throw rejection(response, sentToken)
            404 -> throw ReclasificarException.MovementNotFound()
        }
        val body = response.bodyOrThrow("PATCH /api/transacciones/{id}/categoria")
        return Reclasificacion(
            categoriaId = body.categoria.id,
            categoriaNombre = body.categoria.nombre,
            bucket = BucketDetalleMapper.bucket(body.bucket),
            movidos = body.movidos,
        )
    }

    override suspend fun parecidos(transaccionId: String, categoriaId: String, periodo: Periodo): Parecidos {
        val sentToken = tokenProvider.token()
        val response = api.apiTransaccionesIdParecidosGet(transaccionId, categoriaId, periodo.apiValue)
        when (response.code()) {
            401 -> throw rejection(response, sentToken)
            404 -> throw if (errorCode(response) == "TRANSACCION_NO_ENCONTRADA") {
                ReclasificarException.MovementNotFound()
            } else {
                ReclasificarException.CategoryNotFound()
            }
        }
        val body = response.bodyOrThrow("GET /api/transacciones/{id}/parecidos")
        return Parecidos(patron = body.patron, total = body.total, existente = body.existente?.let(BucketDetalleMapper::existente))
    }

    override suspend fun actualizarCategoria(id: String, cambios: CategoriaCambios): CategoriaCatalogo {
        val sentToken = tokenProvider.token()
        val response = api.apiCategoriasIdPatch(
            id,
            ApiCategoriasIdPatchRequest(bucket = cambios.bucket?.apiName, icono = cambios.icono, nombre = cambios.nombre),
        )
        when (response.code()) {
            400, 409 -> throw categoriaFailure(response)
            401 -> throw rejection(response, sentToken)
            403 -> throw CategoriaException.IsInternal()
            // Whatever its code, the category is not there.
            404 -> throw CategoriaException.NotFound()
        }
        val updated = response.bodyOrThrow("PATCH /api/categorias/{id}")
        return IngestaMapper.category(updated) ?: throw IngestaMapper.malformed("bucket ${updated.bucket}")
    }

    override suspend fun eliminarCategoria(id: String) {
        val sentToken = tokenProvider.token()
        val response = api.apiCategoriasIdDelete(id)
        when (response.code()) {
            401 -> throw rejection(response, sentToken)
            403 -> throw CategoriaException.IsInternal()
            404 -> throw CategoriaException.NotFound()
        }
        if (!response.isSuccessful) throw ApiException(response.code())
    }

    override suspend fun crearPatron(categoriaId: String, patron: String, moverDelPeriodo: Periodo?): PatronCreado {
        val sentToken = tokenProvider.token()
        val response = api.apiPatronesPost(
            ApiPatronesPostRequest(
                categoriaId = categoriaId,
                matchType = "CONTAINS",
                patron = patron,
                moverDelPeriodo = moverDelPeriodo?.apiValue,
            ),
        )
        when (response.code()) {
            400, 404, 409 -> throw patronFailure(response)
            401 -> throw rejection(response, sentToken)
            // 403: «Desconocido» accepts no patterns (CLA-18); 503: the catalog could not be read
            // to move the month. The server explains both.
            403, 503 -> throw PatronException.Rejected(errorBody(response)?.message.orEmpty())
        }
        val body = response.bodyOrThrow("POST /api/patrones")
        return PatronCreado(PatronCategoria(id = body.id, patron = body.patron, matchType = body.matchType), movidos = body.movidos)
    }

    override suspend fun vistaPreviaPatron(categoriaId: String, patron: String): VistaPreviaPatron {
        val sentToken = tokenProvider.token()
        val response = api.apiPatronesVistaPreviaPost(ApiPatronesVistaPreviaPostRequest(categoriaId = categoriaId, patron = patron))
        when (response.code()) {
            400, 404 -> throw patronFailure(response)
            401 -> throw rejection(response, sentToken)
            403 -> throw PatronException.Rejected(errorBody(response)?.message.orEmpty())
        }
        return BucketDetalleMapper.vistaPrevia(response.bodyOrThrow("POST /api/patrones/vista-previa"))
    }

    override suspend fun actualizarPatron(id: String, cambios: PatronCambios): PatronCategoria {
        val sentToken = tokenProvider.token()
        val response = api.apiPatronesIdPatch(id, ApiPatronesIdPatchRequest(categoriaId = cambios.categoriaId, patron = cambios.patron))
        when (response.code()) {
            400, 404, 409 -> throw patronFailure(response)
            401 -> throw rejection(response, sentToken)
            // CLA-18: moving it into «Desconocido»; the server explains why.
            403 -> throw PatronException.Rejected(errorBody(response)?.message.orEmpty())
        }
        return pattern(response.bodyOrThrow("PATCH /api/patrones/{id}"))
    }

    override suspend fun eliminarPatron(id: String) {
        val sentToken = tokenProvider.token()
        val response = api.apiPatronesIdDelete(id)
        when (response.code()) {
            401 -> throw rejection(response, sentToken)
            404 -> throw PatronException.PatternNotFound()
        }
        if (!response.isSuccessful) throw ApiException(response.code())
    }

    private fun pattern(wire: PatronResponse) = PatronCategoria(id = wire.id, patron = wire.patron, matchType = wire.matchType)

    /** One case per `code` the pattern endpoints name; anything else keeps the server's message. */
    private fun patronFailure(response: Response<*>): Exception {
        val error = errorBody(response) ?: return ApiException(response.code())
        return when (error.code) {
            "PATRON_INVALIDO" -> PatronException.InvalidPattern()
            "MATCH_TYPE_INVALIDO" -> PatronException.InvalidMatchType()
            "REGEX_INVALIDA" -> PatronException.InvalidRegex()
            "PRIORIDAD_INVALIDA" -> PatronException.InvalidPriority()
            // CLA-17: the 409 names the holder when it can; an unknown bucket keeps the plain case.
            "PATRON_DUPLICADO" -> error.existente?.let { PatronException.DuplicateOf(it) } ?: PatronException.Duplicate()
            "CATEGORIA_NO_ENCONTRADA" -> PatronException.CategoryNotFound()
            "PATRON_NO_ENCONTRADO" -> PatronException.PatternNotFound()
            else -> PatronException.Rejected(error.message.orEmpty())
        }
    }

    /**
     * The staged copy is ours alone: if it cannot be read it is gone, and only choosing the file
     * again helps, so this must not look like a retryable network error.
     */
    private fun filePart(file: CartolaFile): MultipartBody.Part {
        val bytes = try {
            file.file.readBytes()
        } catch (_: IOException) {
            throw IngestaException.FileUnreadable()
        }
        return MultipartBody.Part.createFormData("file", file.filename, bytes.toRequestBody(octetStream))
    }

    /** Both upload endpoints answer the same errors. `null` when the response is a success. */
    private fun ingestaFailure(response: Response<*>, sentToken: String?): Exception? {
        if (response.isSuccessful) return null
        if (response.code() == 401) return rejection(response, sentToken)
        val error = errorBody(response)
        return when (response.code()) {
            400 -> when (error?.code) {
                "PDF_PROTEGIDO" -> IngestaException.PasswordRequired()
                "PDF_PASSWORD_INCORRECTA" -> IngestaException.PasswordIncorrect()
                "SIN_MOVIMIENTOS" -> IngestaException.NoMovements()
                else -> IngestaException.Rejected(error?.message?.takeIf { it.isNotEmpty() })
            }
            409 -> if (error?.code == "CONSENTIMIENTO_CARTOLAS_REQUERIDO") IngestaException.ConsentRequired() else IngestaException.CatalogIncomplete()
            500 -> IngestaException.ServerFailure()
            503 -> IngestaException.CatalogUnavailable()
            else -> ApiException(response.code())
        }
    }

    /** One case per `code` of `CatalogoErrorResponse`; anything else keeps the server's message. */
    private fun categoriaFailure(response: Response<*>): Exception {
        val error = errorBody(response)
        val code = error?.code ?: return ApiException(response.code())
        return when (code) {
            "NOMBRE_INVALIDO" -> CategoriaException.InvalidName()
            "BUCKET_NO_ASIGNABLE" -> CategoriaException.BucketNotAssignable()
            "ICONO_INVALIDO" -> CategoriaException.InvalidIcon()
            "PATRON_INVALIDO" -> CategoriaException.InvalidPattern(error.indice)
            "MATCH_TYPE_INVALIDO" -> CategoriaException.InvalidMatchType(error.indice)
            "REGEX_INVALIDA" -> CategoriaException.InvalidRegex(error.indice)
            "NOMBRE_DUPLICADO" -> CategoriaException.DuplicateName()
            "PATRON_DUPLICADO" -> CategoriaException.DuplicatePattern(error.indice)
            else -> CategoriaException.Rejected(error.message.orEmpty())
        }
    }

    /**
     * Every authenticated endpoint funnels its 401 through here, so the expired-session
     * notification lives in exactly one place.
     */
    private fun rejection(response: Response<*>, sentToken: String?): Exception = when (errorCode(response)) {
        "SESION_INVALIDA" -> {
            sentToken?.let(onSessionExpired)
            SessionExpiredException()
        }
        "API_KEY_INVALIDA" -> ApiKeyRejectedException()
        else -> ApiException(401)
    }

    /** A failed sign-in is never "session expired": there is no session yet. */
    private fun toSession(response: Response<AuthLoginResponse>, providerSwitchedOff404: Boolean): Session {
        when (response.code()) {
            401 -> throw when (errorCode(response)) {
                "API_KEY_INVALIDA" -> ApiKeyRejectedException()
                "CREDENCIALES_INVALIDAS" -> InvalidCredentialsException()
                else -> ApiException(401)
            }
            404 -> if (providerSwitchedOff404) throw SignInUnavailableException()
            429 -> throw RateLimitedException()
        }
        val login = response.bodyOrThrow("sign-in")
        val expiresAt = try {
            Instant.parse(login.expiresAt)
        } catch (e: DateTimeParseException) {
            throw SerializationException("expiresAt is not an ISO 8601 instant", e)
        }
        return Session(token = login.token, userId = login.userId, expiresAt = expiresAt)
    }

    private fun rejectedKey(response: Response<*>): Exception =
        if (errorCode(response) == "API_KEY_INVALIDA") ApiKeyRejectedException() else ApiException(401)

    private fun <T> Response<T>.bodyOrThrow(what: String): T {
        if (!isSuccessful) throw ApiException(code())
        return body() ?: throw SerializationException("Empty body for $what")
    }

    private fun errorCode(response: Response<*>): String? = errorBody(response)?.code

    /**
     * The fields of an error body the app reads. Each one is read on its own, so an unexpected
     * shape in one never hides another. The body can be read once per response.
     */
    private fun errorBody(response: Response<*>): ErrorBody? {
        val obj = try {
            response.errorBody()?.string()?.let { errorJson.parseToJsonElement(it).jsonObject }
        } catch (_: SerializationException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        } ?: return null
        return ErrorBody(
            code = obj.text("code"),
            message = obj.text("message"),
            indice = (obj["indice"] as? JsonPrimitive)?.intOrNull,
            existente = (obj["existente"] as? JsonObject)?.existente(),
        )
    }

    /** `null` when any field is missing or the bucket is unknown: the plain duplicate case. */
    private fun JsonObject.existente(): PatronExistente? {
        val bucket = text("bucket")?.let(Bucket::fromApi) ?: return null
        return PatronExistente(
            patronId = text("patronId") ?: return null,
            categoriaId = text("categoriaId") ?: return null,
            categoria = text("categoria") ?: return null,
            bucket = bucket,
        )
    }

    private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

    private class ErrorBody(val code: String?, val message: String?, val indice: Int?, val existente: PatronExistente? = null)

    private companion object {
        val errorJson = Json { ignoreUnknownKeys = true }
        val octetStream = "application/octet-stream".toMediaType()
    }
}
