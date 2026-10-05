import CryptoKit
import Foundation

/// The nonce protects against replaying a captured Apple identity token (ADR-047).
/// Per attempt: the app makes a random RAW value, gives Apple its SHA-256 (hex), and
/// sends the RAW value to our API. Apple copies the hash into the token; the server
/// hashes the raw value again and compares. The API requires it: no nonce, no sign-in.
enum AppleNonce {
    /// 32 random bytes as 64 lowercase hex characters. `UInt8.random` uses the system's
    /// cryptographically secure generator.
    static func random() -> String {
        (0..<32).map { _ in String(format: "%02x", UInt8.random(in: .min ... .max)) }.joined()
    }

    static func sha256Hex(_ text: String) -> String {
        SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
