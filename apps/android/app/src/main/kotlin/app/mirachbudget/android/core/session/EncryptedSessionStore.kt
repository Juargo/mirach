package app.mirachbudget.android.core.session

import java.time.Instant
import java.util.Base64
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** One persistent text slot. Production: SharedPreferences ([PreferencesBlobStorage]). */
interface BlobStorage {
    fun read(): String?

    /** Throws when the value could not be persisted. */
    fun write(value: String)

    fun remove()
}

/**
 * Keeps the session encrypted at rest: JSON, encrypted with [cipher] (a Keystore key), Base64 in
 * [storage]. A value that cannot be decrypted or parsed (key lost after a restore, tampering,
 * corruption) loads as "no session", so the person simply signs in again.
 */
class EncryptedSessionStore(
    private val storage: BlobStorage,
    private val cipher: SecretCipher,
) : SessionStore {
    @Serializable
    private class Stored(val token: String, val userId: String, val expiresAt: String)

    override fun load(): Session? {
        val encoded = storage.read() ?: return null
        return try {
            val plain = cipher.decrypt(Base64.getDecoder().decode(encoded))
            val stored = Json.decodeFromString<Stored>(plain.decodeToString())
            Session(stored.token, stored.userId, Instant.parse(stored.expiresAt))
        } catch (_: Exception) {
            null
        }
    }

    override fun save(session: Session) {
        val json = Json.encodeToString(Stored(session.token, session.userId, session.expiresAt.toString()))
        storage.write(Base64.getEncoder().encodeToString(cipher.encrypt(json.encodeToByteArray())))
    }

    override fun clear() = storage.remove()
}
