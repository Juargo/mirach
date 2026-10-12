package app.mirachbudget.android.core.networking

import org.junit.Assert.assertEquals
import org.junit.Test

class SessionExpiryRelayTest {
    @Test
    fun firingWithoutAReceiverIsHarmless() {
        SessionExpiryRelay().fire("tok")
    }

    @Test
    fun deliversTheRejectedTokenToTheConnectedReceiver() {
        val relay = SessionExpiryRelay()
        val received = mutableListOf<String>()
        relay.connect { received += it }

        relay.fire("tok-1")

        assertEquals(listOf("tok-1"), received)
    }

    @Test
    fun connectingAgainReplacesTheReceiver() {
        val relay = SessionExpiryRelay()
        val first = mutableListOf<String>()
        val second = mutableListOf<String>()
        relay.connect { first += it }
        relay.connect { second += it }

        relay.fire("tok")

        assertEquals(emptyList<String>(), first)
        assertEquals(listOf("tok"), second)
    }
}
