package app.mirachbudget.android.core.share

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SharedIntentParserTest {
    private val content = "content://com.bank.files/cartola.pdf"

    @Test
    fun `a send takes the shared stream`() {
        assertEquals(content, SharedIntentParser.sharedUri(SharedIntentParser.ACTION_SEND, stream = content, data = null))
    }

    @Test
    fun `a view takes the opened data`() {
        assertEquals(content, SharedIntentParser.sharedUri(SharedIntentParser.ACTION_VIEW, stream = null, data = content))
    }

    @Test
    fun `the content scheme is matched without regard to case`() {
        val upper = "CONTENT://com.bank.files/cartola.pdf"
        assertEquals(upper, SharedIntentParser.sharedUri(SharedIntentParser.ACTION_VIEW, stream = null, data = upper))
    }

    @Test
    fun `a file or web uri is never accepted`() {
        for (uri in listOf("file:///data/data/app.mirachbudget.android/secret", "https://example.com/c.pdf", "cartola.pdf")) {
            assertNull(uri, SharedIntentParser.sharedUri(SharedIntentParser.ACTION_SEND, stream = uri, data = null))
            assertNull(uri, SharedIntentParser.sharedUri(SharedIntentParser.ACTION_VIEW, stream = null, data = uri))
        }
    }

    @Test
    fun `a launch, a missing uri or a relaunch from recents offers nothing`() {
        assertNull(SharedIntentParser.sharedUri("android.intent.action.MAIN", stream = content, data = content))
        assertNull(SharedIntentParser.sharedUri(null, stream = content, data = content))
        assertNull(SharedIntentParser.sharedUri(SharedIntentParser.ACTION_SEND, stream = null, data = content))
        assertNull(SharedIntentParser.sharedUri(SharedIntentParser.ACTION_VIEW, stream = content, data = null))
        assertNull(
            SharedIntentParser.sharedUri(SharedIntentParser.ACTION_SEND, stream = content, data = null, launchedFromHistory = true),
        )
    }
}

class SharedCartolaInboxTest {
    @Test
    fun `an offered file waits until it is consumed`() {
        val inbox = SharedCartolaInbox()
        assertNull(inbox.pending.value)

        inbox.offer("content://a")
        assertEquals("content://a", inbox.pending.value)

        assertTrue(inbox.consume("content://a"))
        assertNull(inbox.pending.value)
    }

    @Test
    fun `consuming an older file keeps a newer share`() {
        val inbox = SharedCartolaInbox()
        inbox.offer("content://a")
        inbox.offer("content://b")

        assertFalse(inbox.consume("content://a"))
        assertEquals("content://b", inbox.pending.value)
    }
}
