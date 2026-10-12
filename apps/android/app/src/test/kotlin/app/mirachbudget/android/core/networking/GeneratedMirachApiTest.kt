package app.mirachbudget.android.core.networking

import java.io.IOException
import java.net.SocketTimeoutException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.SerializationException
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.SocketEffect
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class GeneratedMirachApiTest {
    private val server = MockWebServer()

    @Before
    fun setUp() = server.start()

    @After
    fun tearDown() = server.close()

    private fun api(timeoutMillis: Long = 5_000, token: String? = null): MirachApi =
        MirachApiFactory.create(
            baseUrl = server.url("/").toString(),
            apiKey = "key-1",
            tokenProvider = { token },
            timeoutMillis = timeoutMillis,
        )

    /** Bounded wait so a request that never arrives fails the test instead of hanging it. */
    private fun awaitRequest() = checkNotNull(server.takeRequest(5, TimeUnit.SECONDS)) { "no request reached the server" }

    private fun enqueueJson(code: Int, body: String) =
        server.enqueue(MockResponse.Builder().code(code).addHeader("Content-Type", "application/json").body(body).build())

    @Test
    fun mapsTheVersionResponse() = runBlocking<Unit> {
        enqueueJson(200, """{"version":"0.11.0","commit":"abc1234","ref":"main","builtAt":"2026-10-11T00:00:00Z"}""")

        assertEquals(VersionInfo(version = "0.11.0", commit = "abc1234"), api().version())
        val request = awaitRequest()
        assertEquals("/version", request.url.encodedPath)
        // /version is public: no credentials leave the device for it.
        assertNull(request.headers["x-api-key"])
    }

    @Test
    fun serverErrorsBecomeApiException() {
        enqueueJson(503, """{"error":"unavailable"}""")

        val error = assertThrows(ApiException::class.java) { runBlocking { api().version() } }
        assertEquals(503, error.status)
    }

    @Test
    fun malformedBodiesFailAsSerializationErrors() {
        enqueueJson(200, """{"version": 42""")

        assertThrows(SerializationException::class.java) { runBlocking { api().version() } }
    }

    @Test
    fun aBodyMissingRequiredFieldsFailsAsSerializationError() {
        enqueueJson(200, """{"version":"0.11.0"}""")

        assertThrows(SerializationException::class.java) { runBlocking { api().version() } }
    }

    @Test
    fun aSilentServerEndsInSocketTimeout() {
        server.enqueue(MockResponse.Builder().onResponseStart(SocketEffect.Stall).build())

        assertThrows(SocketTimeoutException::class.java) { runBlocking { api(timeoutMillis = 200).version() } }
    }

    @Test
    fun anUnreachableServerFailsWithIoException() {
        val api = api()
        server.close()

        assertThrows(IOException::class.java) { runBlocking { api.version() } }
    }

    @Test
    fun cancellationStopsTheRequestAndStaysACancellation() = runBlocking<Unit> {
        server.enqueue(MockResponse.Builder().onResponseStart(SocketEffect.Stall).build())
        var sawCancellation = false
        val job = launch(Dispatchers.IO, start = CoroutineStart.UNDISPATCHED) {
            try {
                api(timeoutMillis = 60_000).version()
            } catch (e: CancellationException) {
                sawCancellation = true
                throw e
            }
        }
        awaitRequest() // the request reached the server and now hangs

        // Without a cancellable call this would wait the full 60 s timeout.
        withTimeout(5_000) { job.cancelAndJoin() }

        assertTrue(job.isCancelled)
        assertTrue("cancellation must propagate, not be mapped to an error", sawCancellation)
    }

    @Test
    fun cancellingAnAsyncCallThrowsCancellationFromAwait() = runBlocking<Unit> {
        server.enqueue(MockResponse.Builder().onResponseStart(SocketEffect.Stall).build())
        val deferred = async(Dispatchers.IO) { api(timeoutMillis = 60_000).version() }
        awaitRequest()

        deferred.cancel()

        assertThrows(CancellationException::class.java) { runBlocking { deferred.await() } }
    }
}
