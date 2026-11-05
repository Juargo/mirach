package app.mirachbudget.android.core.networking

/** The legal documents a person accepts when continuing from the welcome screen (AUTH-03). */
object LegalDocuments {
    /**
     * Both documents are versioned together. Sent with the sign-in; the server stores it with a
     * new account. Bump it when either text changes. The statement-processing consent (PRI-02) is
     * sent with this same version.
     */
    const val VERSION = "2026-11-03"
    const val TERMINOS_URL = "https://mirachbudget.app/terminos"
    const val PRIVACIDAD_URL = "https://mirachbudget.app/privacidad"
}
