package app.mirachbudget.android.core.config

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ConfigurationCheckTest {
    @Test
    fun emptyKeyIsAProblem() {
        assertEquals(ConfigurationCheck.Problem.MissingApiKey, ConfigurationCheck.problem(apiKey = ""))
    }

    @Test
    fun blankKeyIsAProblem() {
        assertEquals(ConfigurationCheck.Problem.MissingApiKey, ConfigurationCheck.problem(apiKey = "  \n\t"))
    }

    @Test
    fun realKeyIsNotAProblem() {
        assertNull(ConfigurationCheck.problem(apiKey = "abc123"))
    }
}
