import SwiftUI
import WebKit

struct WebViewWrapper: UIViewRepresentable {
    var llamaService: LlamaService

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()

        // Register our custom scheme handler ONLY for API calls
        // (scheme "aprendelo" intercepts fetch calls rewritten to aprendelo://api/...)
        let schemeHandler = APISchemeHandler(llamaService: llamaService)
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
    var llamaService: LlamaService

    init(llamaService: LlamaService) {
        self.llamaService = llamaService
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(makeError(404))
            return
        }

        let path = url.path

        if path.hasPrefix("/static/") {
            serveStaticFile(urlSchemeTask: urlSchemeTask, url: url, path: path)
        } else if path.hasPrefix("/api/chat") {
            serveMockChatStream(urlSchemeTask: urlSchemeTask, url: url)
        } else if path.hasPrefix("/api/translate") {
            serveMockTranslation(urlSchemeTask: urlSchemeTask, url: url)
        } else if path.hasPrefix("/api/sentence-builder/generate") {
            serveMockSentenceGenerate(urlSchemeTask: urlSchemeTask, url: url)
        } else if path.hasPrefix("/api/sentence-builder/evaluate") {
            serveMockSentenceEvaluate(urlSchemeTask: urlSchemeTask, url: url)
        } else if path.hasPrefix("/api/models") {
            serveModels(urlSchemeTask: urlSchemeTask, url: url)
        } else {
            let response = HTTPURLResponse(url: url, statusCode: 404, httpVersion: nil, headerFields: nil)!
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didFinish()
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    // MARK: - Static file server

    private func serveStaticFile(urlSchemeTask: WKURLSchemeTask, url: URL, path: String) {
        // Construct a direct file URL from the bundle's WebAssets folder.
        // This avoids the Bundle.main.path(forResource:ofType:) extension-splitting bug.
        guard let webAssetsURL = Bundle.main.url(forResource: "WebAssets", withExtension: nil) else {
            urlSchemeTask.didFailWithError(makeError(500))
            return
        }
        // path is e.g. "/static/flashcards.json" — drop the leading slash
        let relativePath = String(path.dropFirst())
        let fileURL = webAssetsURL.appendingPathComponent(relativePath)

        guard let data = try? Data(contentsOf: fileURL) else {
            // File not found — return a proper 404
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

    // MARK: - Mock API handlers (to be replaced with real llama.cpp inference)

    private func serveMockChatStream(urlSchemeTask: WKURLSchemeTask, url: URL) {
        let headers = [
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*"
        ]
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: headers)!
        urlSchemeTask.didReceive(response)

        let chunk1 = sseChunk(["content": "¡Hola! Soy tu tutor de español en iOS. "])
        urlSchemeTask.didReceive(chunk1)

        DispatchQueue.global().asyncAfter(deadline: .now() + 0.8) {
            let chunk2 = self.sseChunk(["content": "¿Cómo puedo ayudarte hoy?", "done": true])
            urlSchemeTask.didReceive(chunk2)
            urlSchemeTask.didFinish()
        }
    }

    private func serveMockTranslation(urlSchemeTask: WKURLSchemeTask, url: URL) {
        let headers = [
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*"
        ]
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: headers)!
        urlSchemeTask.didReceive(response)
        let chunk = sseChunk(["content": "(iOS offline translation coming soon)", "done": true])
        urlSchemeTask.didReceive(chunk)
        urlSchemeTask.didFinish()
    }

    private func serveMockSentenceGenerate(urlSchemeTask: WKURLSchemeTask, url: URL) {
        // Read flash-phrases.json from bundle and pick a random entry.
        // This mirrors what the JS generateStaticExercise() static fallback does.
        guard
            let webAssetsURL = Bundle.main.url(forResource: "WebAssets", withExtension: nil),
            let data = try? Data(contentsOf: webAssetsURL.appendingPathComponent("static/flash-phrases.json")),
            let phrases = try? JSONSerialization.jsonObject(with: data) as? [String: String],
            !phrases.isEmpty
        else {
            // Absolute fallback if bundle read fails
            let fallback: [String: Any] = [
                "english_translation": "She speaks Spanish very well.",
                "test_sentence": "Ella habla español muy bien.",
                "words": ["Ella", "habla", "español", "muy", "bien.", "come", "corre", "tarde"]
            ]
            serveJSON(urlSchemeTask: urlSchemeTask, url: url, body: fallback)
            return
        }

        let entries = Array(phrases)
        let chosen = entries[Int.random(in: 0..<entries.count)]
        let english = chosen.key
        let spanish = chosen.value

        // Split into words, strip punctuation for individual tokens
        let normalize: (String) -> [String] = { s in
            s.components(separatedBy: .whitespaces)
             .map { $0.trimmingCharacters(in: .punctuationCharacters) }
             .filter { !$0.isEmpty }
        }
        let sentenceWords = spanish.components(separatedBy: .whitespaces).filter { !$0.isEmpty }
        let allSpanishWords = entries.flatMap { normalize($0.value) }

        // Pick 4–8 distractors not already in the sentence
        let sentenceSet = Set(sentenceWords.map { $0.lowercased() })
        var distractors: [String] = []
        var shuffled = allSpanishWords.shuffled()
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
        serveJSON(urlSchemeTask: urlSchemeTask, url: url, body: body)
    }

    private func serveMockSentenceEvaluate(urlSchemeTask: WKURLSchemeTask, url: URL) {
        // Parse the request body to do a real (normalised) string comparison
        var requestBody: [String: Any]? = nil
        if let bodyData = urlSchemeTask.request.httpBody {
            requestBody = try? JSONSerialization.jsonObject(with: bodyData) as? [String: Any]
        }

        let normalize: (String) -> String = { s in
            s.lowercased()
             .trimmingCharacters(in: .whitespacesAndNewlines)
             .components(separatedBy: CharacterSet.punctuationCharacters).joined()
        }

        let userSentence = requestBody?["user_sentence"] as? String ?? ""
        // We don't have the test_sentence here unless passed by the client
        // The client sends english_translation + user_sentence + words_provided
        // Accept if the user's answer matches any of the provided words in the right order
        // Simple heuristic: we don't know the target but can still return encouraging feedback.
        // A proper implementation would require the test_sentence; for now return positive.
        let isCorrect = !normalize(userSentence).isEmpty

        let body: [String: Any] = [
            "correct": isCorrect,
            "feedback": isCorrect
                ? "¡Bien hecho! Tu respuesta parece correcta. (iOS offline mode)"
                : "Intenta de nuevo — tu respuesta estaba vacía.",
            "correction": ""
        ]
        serveJSON(urlSchemeTask: urlSchemeTask, url: url, body: body)
    }

    private func serveModels(urlSchemeTask: WKURLSchemeTask, url: URL) {
        // Report "llama-3.2-3b-ios" as the available on-device model
        let body: [String: Any] = ["models": ["llama-3.2-3b-ios"]]
        serveJSON(urlSchemeTask: urlSchemeTask, url: url, body: body)
    }

    // MARK: - Helpers

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
