package app.mirachbudget.android.core.design

import app.mirachbudget.android.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CategoryIconTest {
    /** The API's allowed list (`apps/api/src/domain/value-objects/icono-categoria.ts`), in its order. */
    private val allowList = listOf(
        "shopping-cart", "fuel", "pill", "heart-pulse", "bus", "house", "zap", "wifi", "smartphone", "graduation-cap",
        "shield", "car", "paw-print", "tv", "bike", "utensils", "shirt", "plane", "gamepad-2", "gift", "dumbbell",
        "piggy-bank", "trending-up", "credit-card", "circle-help",
    )

    @Test
    fun thePickerOffersExactlyTheAllowedListInItsOrder() {
        assertEquals(allowList, CategoryIcon.allowedValues)
    }

    @Test
    fun eachValueHasItsOwnDrawableAndSpokenName() {
        assertEquals(R.drawable.ic_categoria_shopping_cart, CategoryIcon.drawable("shopping-cart"))
        assertEquals(R.drawable.ic_categoria_gamepad_2, CategoryIcon.drawable("gamepad-2"))
        assertEquals("Carrito de compras", CategoryIcon.label("shopping-cart"))
        assertEquals("Otro", CategoryIcon.label("circle-help"))
        assertEquals(allowList.size, CategoryIcon.options.map { it.drawable }.toSet().size)
    }

    @Test
    fun noIconOrAnUnknownOneGetsTheGenericTagAndNoName() {
        assertEquals(R.drawable.ic_categoria_tag, CategoryIcon.drawable(null))
        assertEquals(R.drawable.ic_categoria_tag, CategoryIcon.drawable("rocket"))
        assertNull(CategoryIcon.label(null))
        assertNull(CategoryIcon.label("rocket"))
    }
}
