package app.mirachbudget.android.core.networking

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ApiHeadersTest {
    @Test
    fun addsTheKeyToApiPaths() {
        assertEquals(mapOf("x-api-key" to "k"), ApiHeaders.forPath("/api/auth/me", apiKey = "k"))
    }

    @Test
    fun leavesPublicPathsWithoutTheKey() {
        assertTrue(ApiHeaders.forPath("/version", apiKey = "k").isEmpty())
    }

    @Test
    fun doesNotTreatLookalikePathsAsApi() {
        assertTrue(ApiHeaders.forPath("/apixyz", apiKey = "k").isEmpty())
    }
}
