import Foundation
import Translation

/// Wraps iOS 18's built-in Translation framework for offline neural machine translation.
/// No model download required — the system manages translation models automatically.
/// Requires iOS 18+. Falls back to a clear error message on iOS 17 and below.
@MainActor
class TranslationService {

    // MARK: - Translate

    /// Translates text using the system Translation framework.
    /// - Parameters:
    ///   - text: The text to translate.
    ///   - sourceLang: BCP-47 language code (e.g. "en", "auto"). Pass nil for auto-detect.
    ///   - targetLang: BCP-47 language code (e.g. "es", "fr", "de", "it").
    /// - Returns: The translated string.
    func translate(text: String, from sourceLang: String?, to targetLang: String) async throws -> String {
        guard #available(iOS 18.0, *) else {
            throw TranslationError.unsupportedOS
        }

        let target = Locale.Language(identifier: targetLang)
        let source: Locale.Language? = sourceLang.flatMap {
            ($0 == "Auto-detect" || $0.isEmpty) ? nil : Locale.Language(identifier: $0)
        }

        if #available(iOS 26.0, *) {
            guard let source = source else {
                throw TranslationError.failed("Auto-detect is not supported for offline programmatic translation.")
            }
            let session = TranslationSession(installedSource: source, target: target)
            let response = try await session.translate(text)
            return response.targetText
        } else {
            throw TranslationError.failed("Offline programmatic translation requires iOS 26.0 or later.")
        }
    }
}

enum TranslationError: LocalizedError {
    case unsupportedOS
    case failed(String)

    var errorDescription: String? {
        switch self {
        case .unsupportedOS:
            return "On-device translation requires iOS 18 or later."
        case .failed(let msg):
            return "Translation failed: \(msg)"
        }
    }
}
