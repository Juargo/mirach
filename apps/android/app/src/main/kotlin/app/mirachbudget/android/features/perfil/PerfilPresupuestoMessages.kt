package app.mirachbudget.android.features.perfil

import app.mirachbudget.android.core.networking.PerfilPredefinido
import app.mirachbudget.android.features.perfil.PerfilViewModel.Failure

/**
 * The words of "Perfil de porcentajes" (screen 49): neutral Spanish, "tú". The percentages are
 * static copy tied to the profile id; the API's targets are what Inicio measures against.
 */
object PerfilPresupuestoMessages {
    const val ENTRY_ROW = "Perfil de porcentajes"
    const val TITLE = "Perfil"
    const val NOTE = "Al cambiarlo, recalculamos todos tus meses con el perfil nuevo."
    const val SAVE = "Guardar"
    const val RECOMMENDED = "Recomendado"
    const val LOADING = "Cargando tu perfil…"

    fun load(failure: Failure): String = PerfilMessages.load(failure)

    fun save(failure: Failure): String = when (failure) {
        Failure.Connection -> PerfilMessages.CONNECTION
        Failure.Server -> "No pudimos guardar el perfil. Inténtalo de nuevo en unos segundos."
    }
}

/** One card: id, title, caption and the three shares (Necesidades, Gustos, Ahorro) the bar draws. */
data class PerfilCard(
    val perfil: PerfilPredefinido,
    val title: String,
    val caption: String,
    val necesidades: Int,
    val gustos: Int,
    val ahorro: Int,
    val recommended: Boolean = false,
) {
    /** What a screen reader hears: title, caption and the tag, without the decorative bar. */
    val description: String
        get() = listOfNotNull(title, caption, PerfilPresupuestoMessages.RECOMMENDED.takeIf { recommended }).joinToString(". ")
}

/** The four cards, in order (S1). */
val PERFIL_CARDS: List<PerfilCard> = listOf(
    PerfilCard(
        PerfilPredefinido.P50_30_20, "50 / 30 / 20",
        "Equilibrado · Necesidades 50% · Gustos 30% · Ahorro 20%", 50, 30, 20, recommended = true,
    ),
    PerfilCard(
        PerfilPredefinido.P65_20_15, "65 / 20 / 15",
        "Si tus gastos fijos son altos · Necesidades 65% · Gustos 20% · Ahorro 15%", 65, 20, 15,
    ),
    PerfilCard(
        PerfilPredefinido.P80_10_10, "80 / 10 / 10",
        "Para un mes ajustado o salir de deudas. Tus cuotas cuentan como necesidad · Necesidades 80% · Gustos 10% · Ahorro 10%",
        80, 10, 10,
    ),
    PerfilCard(
        PerfilPredefinido.P90_5_5, "90 / 5 / 5",
        "Con lo justo: casi todo se va en vivir · Necesidades 90% · Gustos 5% · Ahorro 5%", 90, 5, 5,
    ),
)
