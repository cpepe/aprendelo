import Foundation
import MLX
import MLXLLM
import MLXHuggingFace
import MLXLMCommon
import MLXRandom
import HuggingFace
import Tokenizers

/// Manages the on-device Gemma 4 model lifecycle and text generation.
/// Uses Apple's MLX framework for Metal/ANE-accelerated inference.
@MainActor
class GemmaService: ObservableObject {

    // MARK: - Published State

    @Published var state: LLMState = .idle

    enum LLMState: Equatable {
        case idle
        case downloading(progress: Double)
        case loading
        case ready
        case error(String)
    }

    // MARK: - Model Configuration

    /// 4-bit quantized Gemma 4 E4B (Effective 4B) — ~2.5 GB download.
    /// Purpose-built for efficient edge/mobile inference.
    /// Best performance on iPhone 15 Pro+ (A17 Pro) with 8 GB RAM.
    static let modelConfiguration = ModelConfiguration(
        id: "mlx-community/gemma-4-e2b-it-4bit" //"mlx-community/gemma-4-e4b-it-4bit"
    )

    /// Fallback for older/lower-memory devices: Gemma 4 E2B (~1.2 GB)
    static let lightModelConfiguration = ModelConfiguration(
        id: "mlx-community/gemma-4-e2b-it-4bit"
    )

    // MARK: - Private

    private var modelContainer: ModelContainer?
    private var unloadTimer: Timer?
    private let unloadAfter: TimeInterval = 180 // 3 minutes of inactivity

    // MARK: - Public API

    var isReady: Bool {
        if case .ready = state { return true }
        return false
    }

    /// Ensures the model is loaded. Downloads on first use.
    /// Safe to call multiple times — idempotent.
    func ensureLoaded() async {
        guard modelContainer == nil else { return }

        state = .downloading(progress: 0)

        do {
            // v3 API: loadContainer requires explicit downloader + tokenizer loader
            modelContainer = try await LLMModelFactory.shared.loadContainer(
                from: #hubDownloader(),
                using: #huggingFaceTokenizerLoader(),
                configuration: Self.modelConfiguration
            ) { [weak self] progress in
                Task { @MainActor [weak self] in
                    if progress.fractionCompleted < 1.0 {
                        self?.state = .downloading(progress: progress.fractionCompleted)
                    } else {
                        self?.state = .loading
                    }
                }
            }
            state = .ready
            resetUnloadTimer()
        } catch {
            // Try the lighter E2B model as fallback
            do {
                state = .downloading(progress: 0)
                modelContainer = try await LLMModelFactory.shared.loadContainer(
                    from: #hubDownloader(),
                    using: #huggingFaceTokenizerLoader(),
                    configuration: Self.lightModelConfiguration
                ) { [weak self] progress in
                    Task { @MainActor [weak self] in
                        self?.state = .downloading(progress: progress.fractionCompleted)
                    }
                }
                state = .ready
                resetUnloadTimer()
            } catch {
                state = .error(error.localizedDescription)
            }
        }
    }

    /// Streams a chat completion token-by-token.
    /// - Parameters:
    ///   - systemPrompt: The tutor persona/instructions.
    ///   - messages: Array of {role, content} dicts matching OpenAI format.
    ///   - onToken: Called on the main thread with each new text fragment.
    func streamChat(
        systemPrompt: String,
        messages: [[String: String]],
        onToken: @escaping @MainActor (String, Bool) -> Void
    ) async throws {

        guard let container = modelContainer else {
            throw LLMError.notLoaded
        }

        resetUnloadTimer()

        // Build the full message list with system prompt prepended
        var fullMessages: [[String: any Sendable]] = [["role": "system", "content": systemPrompt]]
        for msg in messages {
            fullMessages.append(["role": msg["role"] ?? "user", "content": msg["content"] ?? ""])
        }

        // Run inference on a background executor, stream tokens back
        let _ = try await container.perform { context in
            // v3 API: wrap messages in UserInput and call processor.prepare()
            let input = try await context.processor.prepare(
                input: UserInput(messages: fullMessages)
            )

            return try MLXLMCommon.generate(
                input: input,
                parameters: GenerateParameters(temperature: 0.7, topP: 0.9),
                context: context
            ) { tokens in
                let newText = context.tokenizer.decode(tokenIds: tokens)

                // Emit tokens in small chunks for smooth streaming
                Task { @MainActor in
                    onToken(newText, false)
                }
                return .more
            }
        }

        // Signal completion
        await MainActor.run {
            onToken("", true)
        }
    }

    // MARK: - Memory management

    /// Releases the model from memory after inactivity to reduce iOS memory pressure.
    private func resetUnloadTimer() {
        unloadTimer?.invalidate()
        unloadTimer = Timer.scheduledTimer(withTimeInterval: unloadAfter, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.unload()
            }
        }
    }

    private func unload() {
        modelContainer = nil
        state = .idle
        print("GemmaService: Model unloaded after inactivity.")
    }
}

enum LLMError: LocalizedError {
    case notLoaded

    var errorDescription: String? {
        switch self {
        case .notLoaded:
            return "The language model is not loaded. Please wait for it to initialize."
        }
    }
}
