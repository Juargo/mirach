import Foundation

/// The legal documents a person accepts when continuing from the welcome screen (AUTH-03).
enum LegalDocuments {
    /// Both documents are versioned together. Sent with the sign-in; the server stores it with a
    /// new account. Bump it when either text changes.
    static let version = "2026-11-01"
    static let terminosURL = "https://mirachbudget.app/terminos"
    static let privacidadURL = "https://mirachbudget.app/privacidad"
}
