import Foundation
import MLX
import MLXLLM
import MLXLMCommon
import MLXRandom

/// Manages the on-device Llama model lifecycle and text generation.
/// Uses Apple's MLX framework for Metal/ANE-accelerated inference.
@MainActor
class LlamaService: ObservableObject {

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

    /// 4-bit quantized Llama 3.2 3B — ~1.8 GB download, fits in 4 GB+ iPhone RAM.
    /// Device requirement: iPhone 12 or newer (A14 Bionic) for reasonable speed.
    /// Best performance: iPhone 15 Pro+ (A17 Pro) for ~20 tok/s.
    static let modelConfiguration = ModelConfiguration(
        id: "mlx-community/Llama-3.2-3B-Instruct-4bit"
    )

    /// Fallback for older/lower-memory devices: 1B model (~0.7 GB)
    static let lightModelConfiguration = ModelConfiguration(
        id: "mlx-community/Llama-3.2-1B-Instruct-4bit"
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
            modelContainer = try await LLMModelFactory.shared.loadContainer(
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
            // Try the lighter 1B model as fallback
            do {
                state = .downloading(progress: 0)
                modelContainer = try await LLMModelFactory.shared.loadContainer(
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
        var fullMessages: [[String: String]] = [["role": "system", "content": systemPrompt]]
        fullMessages.append(contentsOf: messages)

        // Run inference on a background executor, stream tokens back
        let _ = try await container.perform { context in
            let input = try await context.processor.applyChatTemplate(messages: fullMessages)

            var tokenBuffer = ""
            var isFirst = true

            return try MLXLMCommon.generate(
                input: input,
                parameters: GenerateParameters(temperature: 0.7, topP: 0.9),
                context: context
            ) { tokens in
                let newText = context.tokenizer.decode(tokens: tokens)
                tokenBuffer += newText

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
        print("LlamaService: Model unloaded after inactivity.")
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
