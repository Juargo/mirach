package app.mirachbudget.android.core.session

import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Encrypts and decrypts opaque bytes; the key never leaves the implementation. */
interface SecretCipher {
    fun encrypt(plain: ByteArray): ByteArray

    /** Throws when [encrypted] is not something this cipher produced (wrong key, tampered, truncated). */
    fun decrypt(encrypted: ByteArray): ByteArray
}

/**
 * AES-256-GCM. Output is `iv || ciphertext+tag`. The key comes from [keyProvider]: the Android
 * Keystore in the app (hardware-backed where available, never extractable), a plain key in tests.
 */
class AesGcmCipher(private val keyProvider: () -> SecretKey) : SecretCipher {
    override fun encrypt(plain: ByteArray): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        // No IV is passed: the provider generates a random one (the Keystore requires it).
        cipher.init(Cipher.ENCRYPT_MODE, keyProvider())
        return cipher.iv + cipher.doFinal(plain)
    }

    override fun decrypt(encrypted: ByteArray): ByteArray {
        require(encrypted.size > IV_BYTES + TAG_BITS / 8) { "Encrypted payload is too short" }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, keyProvider(), GCMParameterSpec(TAG_BITS, encrypted, 0, IV_BYTES))
        return cipher.doFinal(encrypted, IV_BYTES, encrypted.size - IV_BYTES)
    }

    private companion object {
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
        const val TAG_BITS = 128
    }
}
