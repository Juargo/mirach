package app.mirachbudget.android.core.networking

import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

class ApiAuthInterceptorTest {
    private val server = MockWebServer()

    @Before
    fun setUp() = server.start()

    @After
    fun tearDown() = server.close()

    private fun call(path: String, token: String?, appVersion: String = "1.10.0"): RecordedRequest {
        val client = OkHttpClient.Builder()
            .addInterceptor(ApiAuthInterceptor(apiKey = "key-1", tokenProvider = { token }, appVersion = appVersion))
            .build()
        server.enqueue(MockResponse.Builder().code(200).body("{}").build())
        client.newCall(Request.Builder().url(server.url(path)).build()).execute().close()
        return server.takeRequest()
    }

    @Test
    fun apiPathsCarryTheKeyAndTheBearerToken() {
        val request = call("/api/auth/me", token = "tok-9")
        assertEquals("key-1", request.headers["x-api-key"])
        assertEquals("Bearer tok-9", request.headers["Authorization"])
    }

    @Test
    fun withoutATokenOnlyTheKeyIsSent() {
        val request = call("/api/auth/capabilities", token = null)
        assertEquals("key-1", request.headers["x-api-key"])
        assertNull(request.headers["Authorization"])
    }

    @Test
    fun publicPathsReceiveNoCredentials() {
        val request = call("/version", token = "tok-9")
        assertNull(request.headers["x-api-key"])
        assertNull(request.headers["Authorization"])
    }

    @Test
    fun lookalikePathsAreNotApiPaths() {
        val request = call("/apixyz", token = "tok-9")
        assertNull(request.headers["x-api-key"])
        assertNull(request.headers["Authorization"])
    }

    @Test
    fun everyRequestCarriesTheAppVersionAndPlatform() {
        for (path in listOf("/api/config", "/api/resumen", "/version")) {
            val request = call(path, token = null)
            assertEquals("1.10.0", request.headers["X-App-Version"])
            assertEquals("android", request.headers["X-App-Platform"])
        }
    }

    @Test
    fun anEmptyAppVersionIsNotSent() {
        val request = call("/api/config", token = null, appVersion = "")
        assertNull(request.headers["X-App-Version"])
        assertEquals("android", request.headers["X-App-Platform"])
    }
}
