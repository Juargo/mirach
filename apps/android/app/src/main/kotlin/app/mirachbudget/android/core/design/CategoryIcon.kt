package app.mirachbudget.android.core.design

import androidx.annotation.DrawableRes
import app.mirachbudget.android.R

/**
 * The category icons of the API's allowed list (`icono-categoria.ts`) as Lucide vector drawables
 * (`res/drawable/ic_categoria_*.xml`). A value the app does not know, or `null`, gets the generic
 * tag: never an error. [options] is in the catalog's order, for the picker. Mirrors iOS
 * `CategoryIcon`, including the spoken names.
 */
object CategoryIcon {
    data class Option(val value: String, @DrawableRes val drawable: Int, val label: String)

    @DrawableRes
    val generic: Int = R.drawable.ic_categoria_tag

    val options: List<Option> = listOf(
        Option("shopping-cart", R.drawable.ic_categoria_shopping_cart, "Carrito de compras"),
        Option("fuel", R.drawable.ic_categoria_fuel, "Combustible"),
        Option("pill", R.drawable.ic_categoria_pill, "Medicamentos"),
        Option("heart-pulse", R.drawable.ic_categoria_heart_pulse, "Salud"),
        Option("bus", R.drawable.ic_categoria_bus, "Bus"),
        Option("house", R.drawable.ic_categoria_house, "Casa"),
        Option("zap", R.drawable.ic_categoria_zap, "Electricidad"),
        Option("wifi", R.drawable.ic_categoria_wifi, "Internet"),
        Option("smartphone", R.drawable.ic_categoria_smartphone, "Celular"),
        Option("graduation-cap", R.drawable.ic_categoria_graduation_cap, "Educación"),
        Option("shield", R.drawable.ic_categoria_shield, "Seguro"),
        Option("car", R.drawable.ic_categoria_car, "Auto"),
        Option("paw-print", R.drawable.ic_categoria_paw_print, "Mascotas"),
        Option("tv", R.drawable.ic_categoria_tv, "Televisión"),
        Option("bike", R.drawable.ic_categoria_bike, "Bicicleta"),
        Option("utensils", R.drawable.ic_categoria_utensils, "Comida"),
        Option("shirt", R.drawable.ic_categoria_shirt, "Ropa"),
        Option("plane", R.drawable.ic_categoria_plane, "Viajes"),
        Option("gamepad-2", R.drawable.ic_categoria_gamepad_2, "Juegos"),
        Option("gift", R.drawable.ic_categoria_gift, "Regalos"),
        Option("dumbbell", R.drawable.ic_categoria_dumbbell, "Ejercicio"),
        Option("piggy-bank", R.drawable.ic_categoria_piggy_bank, "Ahorro"),
        Option("trending-up", R.drawable.ic_categoria_trending_up, "Inversión"),
        Option("credit-card", R.drawable.ic_categoria_credit_card, "Tarjeta"),
        Option("circle-help", R.drawable.ic_categoria_circle_help, "Otro"),
    )

    val allowedValues: List<String> get() = options.map { it.value }

    @DrawableRes
    fun drawable(icono: String?): Int = option(icono)?.drawable ?: generic

    /** The spoken name of the icon; `null` for no icon or one the app does not know. */
    fun label(icono: String?): String? = option(icono)?.label

    private fun option(icono: String?): Option? = icono?.let { value -> options.firstOrNull { it.value == value } }
}
