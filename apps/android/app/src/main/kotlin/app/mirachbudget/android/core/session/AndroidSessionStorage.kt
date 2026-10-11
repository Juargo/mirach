package app.mirachbudget.android.core.session

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

/** The Android-only pieces of session storage; the logic lives in [EncryptedSessionStore]. */
object AndroidSessionStorage {
    private const val PROVIDER = "AndroidKeyStore"
    private const val KEY_ALIAS = "app.mirachbudget.android.session"
    private const val PREFS = "mirach_session"

    fun create(context: Context): SessionStore = EncryptedSessionStore(
        storage = PreferencesBlobStorage(context.applicationContext),
        cipher = AesGcmCipher(::keystoreKey),
    )

    /** The AES key lives in the Keystore: the app never sees its bytes. Created on first use. */
    @Synchronized
    private fun keystoreKey(): SecretKey {
        val keyStore = KeyStore.getInstance(PROVIDER).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val spec = KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, PROVIDER).apply { init(spec) }.generateKey()
    }

    private class PreferencesBlobStorage(context: Context) : BlobStorage {
        private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

        override fun read(): String? = prefs.getString(KEY, null)

        // commit() (not apply()) so a failed write is reported instead of lost.
        override fun write(value: String) {
            check(prefs.edit().putString(KEY, value).commit()) { "Could not persist the session" }
        }

        override fun remove() {
            check(prefs.edit().remove(KEY).commit()) { "Could not delete the session" }
        }

        private companion object {
            const val KEY = "session"
        }
    }
}
