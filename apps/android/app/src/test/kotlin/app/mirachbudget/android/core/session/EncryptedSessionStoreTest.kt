package app.mirachbudget.android.core.session

import java.time.Instant
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class EncryptedSessionStoreTest {
    private class MapBlobStorage : BlobStorage {
        var value: String? = null
        override fun read() = value
        override fun write(value: String) { this.value = value }
        override fun remove() { value = null }
    }

    private val key: SecretKey = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
    private val storage = MapBlobStorage()
    private val store = EncryptedSessionStore(storage, AesGcmCipher { key })
    private val session = Session("tok-secret-123", "u-1", Instant.parse("2026-12-01T00:00:00Z"))

    @Test
    fun emptyStoreHasNoSession() {
        assertNull(store.load())
    }

    @Test
    fun savedSessionRoundTrips() {
        store.save(session)

        assertEquals(session, store.load())
    }

    @Test
    fun theTokenIsNeverStoredInTheClear() {
        store.save(session)

        val stored = checkNotNull(storage.value)
        assertFalse(stored.contains("tok-secret-123"))
        assertFalse(java.util.Base64.getDecoder().decode(stored).decodeToString().contains("tok-secret-123"))
    }

    @Test
    fun saveReplacesAndEachWriteUsesAFreshIv() {
        store.save(session)
        val first = storage.value
        store.save(session)

        assertNotEquals(first, storage.value)
        assertEquals(session, store.load())
    }

    @Test
    fun clearRemovesTheSession() {
        store.save(session)

        store.clear()

        assertNull(store.load())
        assertNull(storage.value)
    }

    @Test
    fun tamperedDataLoadsAsNoSession() {
        store.save(session)
        val bytes = java.util.Base64.getDecoder().decode(checkNotNull(storage.value))
        bytes[bytes.lastIndex] = (bytes.last() + 1).toByte()
        storage.value = java.util.Base64.getEncoder().encodeToString(bytes)

        assertNull(store.load())
    }

    @Test
    fun dataWrittenWithAnotherKeyLoadsAsNoSession() {
        store.save(session)
        val otherKey = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()

        assertNull(EncryptedSessionStore(storage, AesGcmCipher { otherKey }).load())
    }

    @Test
    fun garbageAndNonJsonPlaintextLoadAsNoSession() {
        storage.value = "%%% not base64 %%%"
        assertNull(store.load())

        storage.value = java.util.Base64.getEncoder().encodeToString(AesGcmCipher { key }.encrypt("not json".toByteArray()))
        assertNull(store.load())
    }

    @Test
    fun cipherRoundTripsBytes() {
        val cipher = AesGcmCipher { key }
        val encrypted = cipher.encrypt("hello".toByteArray())

        assertTrue(encrypted.size > "hello".length)
        assertArrayEquals("hello".toByteArray(), cipher.decrypt(encrypted))
    }

    @Test
    fun cipherRejectsTooShortInput() {
        assertThrows(Exception::class.java) { AesGcmCipher { key }.decrypt(ByteArray(3)) }
    }
}
