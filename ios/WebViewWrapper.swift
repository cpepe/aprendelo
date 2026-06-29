import SwiftUI
import WebKit

struct WebViewWrapper: UIViewRepresentable {
    var gemmaService: GemmaService

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()

        // Register our custom scheme handler ONLY for API calls
        // (scheme "aprendelo" intercepts fetch calls rewritten to aprendelo://api/...)
        let schemeHandler = APISchemeHandler(gemmaService: gemmaService)
        configuration.setURLSchemeHandler(schemeHandler, forURLScheme: "aprendelo")

        // Inject a script that rewrites fetch('/api/...') → fetch('aprendelo://host/api/...')
        // This lets us load the HTML via file:// (so CSS/JS resolve natively)
        // while still intercepting API calls in Swift.
        let apiRedirectScript = WKUserScript(
            source: """
            (function() {
                const _origFetch = window.fetch.bind(window);
                window.fetch = function(input, init) {
                    let url = (input instanceof Request) ? input.url : String(input);
                    // Rewrite both /api/ and /static/ (and relative ./static/) through our scheme
                    // WebKit blocks fetch() to file:// URLs even with allowingReadAccessTo.
                    if (url.startsWith('/api/') || url.startsWith('/static/')) {
                        const newUrl = 'aprendelo://host' + url;
                        if (input instanceof Request) {
                            input = new Request(newUrl, input);
                        } else {
                            input = newUrl;
                        }
                    } else if (url.startsWith('./static/')) {
                        const newUrl = 'aprendelo://host' + url.slice(1); // strip leading dot
                        if (input instanceof Request) {
                            input = new Request(newUrl, input);
                        } else {
                            input = newUrl;
                        }
                    }
                    return _origFetch(input, init);
                };
            })();
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        )
        configuration.userContentController.addUserScript(apiRedirectScript)

        let webView = WKWebView(frame: .zero, configuration: configuration)

        // Load index.html via file:// URL, granting read access to the whole WebAssets folder.
        // This means WebKit will resolve ./static/style.css, ./static/app.js etc. natively
        // from disk without any custom scheme handler needed.
        if let webAssetsURL = Bundle.main.url(forResource: "WebAssets", withExtension: nil) {
            let indexURL = webAssetsURL.appendingPathComponent("index.html")
            webView.loadFileURL(indexURL, allowingReadAccessTo: webAssetsURL)
        }

        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

// MARK: - API Scheme Handler (handles aprendelo://host/api/* calls only)

class APISchemeHandler: NSObject, WKURLSchemeHandler {
    var gemmaService: GemmaService
    private let tracker = ActiveTaskTracker()

    init(gemmaService: GemmaService) {
        self.gemmaService = gemmaService
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(makeError(404))
            return
        }

        let path = url.path
        let bodyData = getHTTPBody(from: urlSchemeTask.request) ?? Data()

        if path.hasPrefix("/static/") {
            serveStaticFile(urlSchemeTask: urlSchemeTask, url: url, path: path)
        } else if path.hasPrefix("/api/chat") {
            serveChatStream(urlSchemeTask: urlSchemeTask, requestData: bodyData)
        } else if path.hasPrefix("/api/translate") {
            serveTranslateStream(urlSchemeTask: urlSchemeTask, requestData: bodyData)
        } else if path.hasPrefix("/api/sentence-builder/generate") {
            serveSentenceGenerate(urlSchemeTask: urlSchemeTask, requestData: bodyData)
        } else if path.hasPrefix("/api/sentence-builder/evaluate") {
            serveSentenceEvaluate(urlSchemeTask: urlSchemeTask, requestData: bodyData)
        } else if path.hasPrefix("/api/models") {
            serveModels(urlSchemeTask: urlSchemeTask, url: url)
        } else {
            let response = HTTPURLResponse(url: url, statusCode: 404, httpVersion: nil, headerFields: nil)!
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didFinish()
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        tracker.stop(urlSchemeTask)
    }

    // MARK: - Static file server

    private func serveStaticFile(urlSchemeTask: WKURLSchemeTask, url: URL, path: String) {
        guard let webAssetsURL = Bundle.main.url(forResource: "WebAssets", withExtension: nil) else {
            urlSchemeTask.didFailWithError(makeError(500))
            return
        }
        let relativePath = String(path.dropFirst())
        let fileURL = webAssetsURL.appendingPathComponent(relativePath)

        guard let data = try? Data(contentsOf: fileURL) else {
            let response = HTTPURLResponse(url: url, statusCode: 404, httpVersion: nil, headerFields: nil)!
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didFinish()
            return
        }

        let ext = fileURL.pathExtension
        let mimeType = getMimeType(for: ext)
        let headers = [
            "Content-Type": mimeType,
            "Access-Control-Allow-Origin": "*"
        ]
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: headers)!
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    // MARK: - Real API Handlers (Integrated with GemmaService)

    private func serveChatStream(urlSchemeTask: WKURLSchemeTask, requestData: Data) {
        guard let req = try? JSONDecoder().decode(ChatRequest.self, from: requestData) else {
            let response = HTTPURLResponse(url: urlSchemeTask.request.url!, statusCode: 400, httpVersion: nil, headerFields: nil)!
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didFinish()
            return
        }

        let headers = [
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*"
        ]
        let response = HTTPURLResponse(url: urlSchemeTask.request.url!, statusCode: 200, httpVersion: nil, headerFields: headers)!
        urlSchemeTask.didReceive(response)

        tracker.start(urlSchemeTask)

        Task { @MainActor in
            await gemmaService.ensureLoaded()

            let proficiency = req.proficiency ?? "B1"
            let dynamicSystemPrompt = """
            You are a friendly, patient native Spanish speaker helping an English speaker learn Spanish through conversation. \
            Your student's current proficiency level is \(proficiency) (A1=Beginner, A2=Elementary, B1=Intermediate, B2=Upper Intermediate, C1=Advanced, C2=Mastery). \
            Respond ONLY in Spanish, and STRICTLY limit your vocabulary, grammar, and sentence complexity to match the \(proficiency) level. \
            Do not use English translations. If the user makes a noticeable grammar or vocabulary error, gently correct them by showing the correct Spanish form in parentheses or with a brief explanation in Spanish. \
            Suggest new vocabulary when natural. Keep replies conversational and encouraging. Even if the user writes in English, you must respond entirely in Spanish.
            """

            var messages = req.history ?? []
            messages.append(["role": "user", "content": req.message])

            do {
                try await gemmaService.streamChat(systemPrompt: dynamicSystemPrompt, messages: messages) { [self] token, done in
                    guard self.tracker.isActive(urlSchemeTask) else { return }
                    if done {
                        let finalChunk = self.sseChunk(["done": true])
                        urlSchemeTask.didReceive(finalChunk)
                        urlSchemeTask.didFinish()
                        self.tracker.stop(urlSchemeTask)
                    } else if !token.isEmpty {
                        let chunk = self.sseChunk(["content": token])
                        urlSchemeTask.didReceive(chunk)
                    }
                }
            } catch {
                guard self.tracker.isActive(urlSchemeTask) else { return }
                let errorChunk = self.sseChunk(["content": "\n[Error: \(error.localizedDescription)]", "done": true])
                urlSchemeTask.didReceive(errorChunk)
                urlSchemeTask.didFinish()
                self.tracker.stop(urlSchemeTask)
            }
        }
    }

    private func serveTranslateStream(urlSchemeTask: WKURLSchemeTask, requestData: Data) {
        guard let req = try? JSONDecoder().decode(TranslateRequest.self, from: requestData) else {
            let response = HTTPURLResponse(url: urlSchemeTask.request.url!, statusCode: 400, httpVersion: nil, headerFields: nil)!
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didFinish()
            return
        }

        let headers = [
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*"
        ]
        let response = HTTPURLResponse(url: urlSchemeTask.request.url!, statusCode: 200, httpVersion: nil, headerFields: headers)!
        urlSchemeTask.didReceive(response)

        tracker.start(urlSchemeTask)

        Task { @MainActor in
            await gemmaService.ensureLoaded()

            let sourceLang = req.source_lang ?? "Auto-detect"
            let targetLang = req.target_lang ?? "Spanish"
            let sourceInstruction: String
            if sourceLang.lowercased() == "auto-detect" || sourceLang.isEmpty {
                sourceInstruction = "detect the language of the following text and translate it to \(targetLang)"
            } else {
                sourceInstruction = "translate the following text from \(sourceLang) to \(targetLang)"
            }
            let proficiency = req.proficiency ?? "B1"
            let systemPrompt = """
            You are a professional translator. \(sourceInstruction.capitalized). \
            Target the translation at a \(proficiency) CEFR proficiency level — use vocabulary and grammar structures appropriate for that level. \
            Preserve paragraph structure exactly. Do not add any commentary, notes, or explanations. Output ONLY the translated text.
            """

            do {
                try await gemmaService.streamChat(systemPrompt: systemPrompt, messages: [["role": "user", "content": req.text]]) { [self] token, done in
                    guard self.tracker.isActive(urlSchemeTask) else { return }
                    if done {
                        let finalChunk = self.sseChunk(["done": true])
                        urlSchemeTask.didReceive(finalChunk)
                        urlSchemeTask.didFinish()
                        self.tracker.stop(urlSchemeTask)
                    } else if !token.isEmpty {
                        let chunk = self.sseChunk(["content": token])
                        urlSchemeTask.didReceive(chunk)
                    }
                }
            } catch {
                guard self.tracker.isActive(urlSchemeTask) else { return }
                let errorChunk = self.sseChunk(["content": "\n[Error: \(error.localizedDescription)]", "done": true])
                urlSchemeTask.didReceive(errorChunk)
                urlSchemeTask.didFinish()
                self.tracker.stop(urlSchemeTask)
            }
        }
    }

    private func serveSentenceGenerate(urlSchemeTask: WKURLSchemeTask, requestData: Data) {
        let req = try? JSONDecoder().decode(SentenceGenerateRequest.self, from: requestData)
        let topic = req?.topic?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let proficiency = req?.proficiency ?? "B1"

        let resolvedTopic: String
        if topic.isEmpty {
            let randomSeeds = ["hablar", "comer", "vivir", "ser", "estar", "ir", "tener", "hacer", "viajar", "familia", "comida", "trabajo", "escuela", "tiempo", "ciudad", "amigo", "poder", "decir", "ver", "dar"]
            resolvedTopic = randomSeeds.randomElement()!
        } else {
            resolvedTopic = topic
        }

        tracker.start(urlSchemeTask)

        Task { @MainActor in
            await gemmaService.ensureLoaded()

            let systemPrompt = """
            You are a Spanish tutor generating a sentence construction exercise. \
            Generate a single natural, idiomatic Spanish sentence related to the topic/verb provided by the user. \
            Then, provide a prompt in English to help the user understand the context. Target a \(proficiency) CEFR proficiency level for vocabulary and grammar. \
            Output ONLY valid JSON with the following structure:
            {
              "english_translation": "The english sentence",
              "test_sentence": "La oración en español",
              "distractors": ["falsa1", "falsa2", "falsa3", "falsa4"]
            }
            CRITICAL INSTRUCTIONS:
            1. The 'test_sentence' must be a complete, grammatically correct Spanish sentence.
            2. Provide 4 to 8 distractor words in the 'distractors' array. These must be real Spanish words relevant to the topic but must NOT appear in the test_sentence.
            3. Distractors should be plausible but must not allow a second valid sentence to be formed.
            Output nothing but the JSON object.
            """

            var accumulatedText = ""
            do {
                try await gemmaService.streamChat(systemPrompt: systemPrompt, messages: [["role": "user", "content": "Topic/Verb: \(resolvedTopic)"]]) { token, done in
                    if !done {
                        accumulatedText += token
                    }
                }

                guard tracker.isActive(urlSchemeTask) else { return }

                if let jsonDict = extractJSON(from: accumulatedText) {
                    let testSentence = (jsonDict["test_sentence"] as? String) ?? ""
                    let distractors = (jsonDict["distractors"] as? [String]) ?? []
                    let sentenceWords = testSentence.components(separatedBy: .whitespaces).filter { !$0.isEmpty }
                    var allWords = sentenceWords + distractors
                    allWords.shuffle()

                    let body: [String: Any] = [
                        "english_translation": (jsonDict["english_translation"] as? String) ?? "",
                        "test_sentence": testSentence,
                        "words": allWords
                    ]
                    serveJSON(urlSchemeTask: urlSchemeTask, url: urlSchemeTask.request.url!, body: body)
                } else {
                    serveStaticFallbackSentence(urlSchemeTask: urlSchemeTask)
                }
            } catch {
                guard tracker.isActive(urlSchemeTask) else { return }
                serveStaticFallbackSentence(urlSchemeTask: urlSchemeTask)
            }
            tracker.stop(urlSchemeTask)
        }
    }

    private func serveSentenceEvaluate(urlSchemeTask: WKURLSchemeTask, requestData: Data) {
        guard let jsonRequest = try? JSONSerialization.jsonObject(with: requestData) as? [String: Any] else {
            serveStaticFallbackEvaluate(urlSchemeTask: urlSchemeTask, userSentence: "")
            return
        }

        let englishTranslation = (jsonRequest["english_translation"] as? String) ?? ""
        let userSentence = (jsonRequest["user_sentence"] as? String) ?? ""
        let proficiency = (jsonRequest["proficiency"] as? String) ?? "B1"
        let wordsProvided = (jsonRequest["words_provided"] as? [String]) ?? []

        tracker.start(urlSchemeTask)

        Task { @MainActor in
            await gemmaService.ensureLoaded()

            let systemPrompt = """
            You are a Spanish tutor evaluating a student's translation. \
            The student was given an English prompt to translate into Spanish. \
            Their CEFR level is \(proficiency). \
            IMPORTANT CONTEXT: The student was ONLY given the following jumbled words to build their sentence: \(wordsProvided). \
            You are grading BOTH the student's attempt AND the sentence generator. \
            If the student built the best possible sentence using the provided words, even if it is slightly incorrect or missing words (like 'que', 'de', etc.) because the generator forgot to provide them, do NOT penalize the student. Set 'correct' to true and acknowledge the missing words in the feedback. \
            If the student made a genuine mistake using the provided words, set 'correct' to false, explain the error gently in English, and provide the ideal correction. \
            Allow for natural Spanish flexibility (e.g., dropped pronouns, flexible word order, valid synonyms). \
            Output ONLY valid JSON with the following structure:
            {
              "correct": true|false,
              "feedback": "Explanation of what was good or what went wrong.",
              "correction": "The ideal Spanish sentence."
            }
            Output nothing but the JSON object.
            """

            var accumulatedText = ""
            do {
                try await gemmaService.streamChat(
                    systemPrompt: systemPrompt,
                    messages: [["role": "user", "content": "English Prompt: \(englishTranslation)\nUser Translation: \(userSentence)"]]
                ) { token, done in
                    if !done {
                        accumulatedText += token
                    }
                }

                guard tracker.isActive(urlSchemeTask) else { return }

                if let jsonDict = extractJSON(from: accumulatedText) {
                    serveJSON(urlSchemeTask: urlSchemeTask, url: urlSchemeTask.request.url!, body: jsonDict)
                } else {
                    serveStaticFallbackEvaluate(urlSchemeTask: urlSchemeTask, userSentence: userSentence)
                }
            } catch {
                guard tracker.isActive(urlSchemeTask) else { return }
                serveStaticFallbackEvaluate(urlSchemeTask: urlSchemeTask, userSentence: userSentence)
            }
            tracker.stop(urlSchemeTask)
        }
    }

    private func serveModels(urlSchemeTask: WKURLSchemeTask, url: URL) {
        let body: [String: Any] = ["models": ["gemma-4-e4b-ios"]]
        serveJSON(urlSchemeTask: urlSchemeTask, url: url, body: body)
    }

    // MARK: - Helpers

    private func getHTTPBody(from request: URLRequest) -> Data? {
        if let body = request.httpBody {
            return body
        }
        if let stream = request.httpBodyStream {
            stream.open()
            let bufferSize = 1024
            var data = Data()
            let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
            defer { buffer.deallocate() }
            while stream.hasBytesAvailable {
                let read = stream.read(buffer, maxLength: bufferSize)
                if read > 0 {
                    data.append(buffer, count: read)
                } else if read < 0 {
                    return nil
                } else {
                    break
                }
            }
            stream.close()
            return data
        }
        return nil
    }

    private func serveStaticFallbackSentence(urlSchemeTask: WKURLSchemeTask) {
        guard
            let webAssetsURL = Bundle.main.url(forResource: "WebAssets", withExtension: nil),
            let data = try? Data(contentsOf: webAssetsURL.appendingPathComponent("static/flash-phrases.json")),
            let phrases = try? JSONSerialization.jsonObject(with: data) as? [String: String],
            !phrases.isEmpty
        else {
            let fallback: [String: Any] = [
                "english_translation": "She speaks Spanish very well.",
                "test_sentence": "Ella habla español muy bien.",
                "words": ["Ella", "habla", "español", "muy", "bien.", "come", "corre", "tarde"]
            ]
            serveJSON(urlSchemeTask: urlSchemeTask, url: urlSchemeTask.request.url!, body: fallback)
            return
        }

        let entries = Array(phrases)
        let chosen = entries[Int.random(in: 0..<entries.count)]
        let english = chosen.key
        let spanish = chosen.value

        let sentenceWords = spanish.components(separatedBy: .whitespaces).filter { !$0.isEmpty }
        let allSpanishWords = entries.flatMap { $0.value.components(separatedBy: .whitespaces).map { $0.trimmingCharacters(in: .punctuationCharacters) } }.filter { !$0.isEmpty }

        let sentenceSet = Set(sentenceWords.map { $0.lowercased() })
        var distractors: [String] = []
        let shuffled = allSpanishWords.shuffled()
        for word in shuffled {
            if distractors.count >= 6 { break }
            if !sentenceSet.contains(word.lowercased()) && !distractors.contains(word) {
                distractors.append(word)
            }
        }

        var allWords = sentenceWords + distractors
        allWords.shuffle()

        let body: [String: Any] = [
            "english_translation": english,
            "test_sentence": spanish,
            "words": allWords
        ]
        serveJSON(urlSchemeTask: urlSchemeTask, url: urlSchemeTask.request.url!, body: body)
    }

    private func serveStaticFallbackEvaluate(urlSchemeTask: WKURLSchemeTask, userSentence: String) {
        let isCorrect = !userSentence.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let body: [String: Any] = [
            "correct": isCorrect,
            "feedback": isCorrect
                ? "¡Bien hecho! Tu respuesta parece correcta. (iOS fallback mode)"
                : "Intenta de nuevo — tu respuesta estaba vacía.",
            "correction": ""
        ]
        serveJSON(urlSchemeTask: urlSchemeTask, url: urlSchemeTask.request.url!, body: body)
    }

    private func extractJSON(from text: String) -> [String: Any]? {
        guard let start = text.firstIndex(of: "{"),
              let end = text.lastIndex(of: "}") else {
            return nil
        }
        let jsonStr = String(text[start...end])
        guard let data = jsonStr.data(using: .utf8) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }

    private func getMimeType(for ext: String) -> String {
        switch ext {
        case "css":  return "text/css"
        case "js":   return "application/javascript"
        case "json": return "application/json"
        case "png":  return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif":  return "image/gif"
        case "svg":  return "image/svg+xml"
        case "webp": return "image/webp"
        case "ttf":  return "font/ttf"
        case "woff": return "font/woff"
        case "woff2": return "font/woff2"
        default:     return "application/octet-stream"
        }
    }

    private func serveJSON(urlSchemeTask: WKURLSchemeTask, url: URL, body: [String: Any]) {
        let headers = [
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        ]
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: headers)!
        urlSchemeTask.didReceive(response)
        if let data = try? JSONSerialization.data(withJSONObject: body) {
            urlSchemeTask.didReceive(data)
        }
        urlSchemeTask.didFinish()
    }

    private func sseChunk(_ payload: [String: Any]) -> Data {
        if let data = try? JSONSerialization.data(withJSONObject: payload),
           let jsonStr = String(data: data, encoding: .utf8) {
            return "data: \(jsonStr)\n\n".data(using: .utf8)!
        }
        return Data()
    }

    private func makeError(_ code: Int) -> NSError {
        NSError(domain: "APISchemeHandler", code: code, userInfo: nil)
    }
}

// MARK: - Task Tracker & Decodables

private class ActiveTaskTracker {
    private var activeTaskIDs = Set<ObjectIdentifier>()
    private let lock = NSRecursiveLock()

    func start(_ task: WKURLSchemeTask) {
        lock.lock()
        defer { lock.unlock() }
        activeTaskIDs.insert(ObjectIdentifier(task as AnyObject))
    }

    func stop(_ task: WKURLSchemeTask) {
        lock.lock()
        defer { lock.unlock() }
        activeTaskIDs.remove(ObjectIdentifier(task as AnyObject))
    }

    func isActive(_ task: WKURLSchemeTask) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return activeTaskIDs.contains(ObjectIdentifier(task as AnyObject))
    }
}

private struct ChatRequest: Decodable {
    let message: String
    let history: [[String: String]]?
    let model: String?
    let proficiency: String?
}

private struct TranslateRequest: Decodable {
    let text: String
    let source_lang: String?
    let target_lang: String?
    let model: String?
    let proficiency: String?
}

private struct SentenceGenerateRequest: Decodable {
    let topic: String?
    let proficiency: String?
    let model: String?
}
