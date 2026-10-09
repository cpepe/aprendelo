import SwiftUI
import WebKit

struct WebViewWrapper: UIViewRepresentable {

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()

        // Register custom scheme handler ONLY for API calls
        let schemeHandler = APISchemeHandler()
        configuration.setURLSchemeHandler(schemeHandler, forURLScheme: "aprendelo")

        // Inject script that rewrites fetch('/api/...') → fetch('aprendelo://host/api/...')
        let apiRedirectScript = WKUserScript(
            source: """
            (function() {
                const _origFetch = window.fetch.bind(window);
                window.fetch = function(input, init) {
                    let url = (input instanceof Request) ? input.url : String(input);
                    if (url.startsWith('/api/') || url.startsWith('/static/')) {
                        const newUrl = 'aprendelo://host' + url;
                        if (input instanceof Request) {
                            input = new Request(newUrl, input);
                        } else {
                            input = newUrl;
                        }
                    } else if (url.startsWith('./static/')) {
                        const newUrl = 'aprendelo://host' + url.slice(1);
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

        if let webAssetsURL = Bundle.main.url(forResource: "WebAssets", withExtension: nil) {
            let indexURL = webAssetsURL.appendingPathComponent("index.html")
            webView.loadFileURL(indexURL, allowingReadAccessTo: webAssetsURL)
        }

        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

// MARK: - API Scheme Handler (Static & Native Services)

class APISchemeHandler: NSObject, WKURLSchemeHandler {
    private let tracker = ActiveTaskTracker()

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

    // MARK: - Static File Server

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

    // MARK: - Chat Handler (Preconfigured Scenarios)

    private func serveChatStream(urlSchemeTask: WKURLSchemeTask, requestData: Data) {
        let req = (try? JSONDecoder().decode(ChatRequest.self, from: requestData)) ?? ChatRequest(message: "", history: nil, model: nil, proficiency: "B1")
        let proficiency = req.proficiency ?? "B1"

        let headers = [
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*"
        ]
        let response = HTTPURLResponse(url: urlSchemeTask.request.url!, statusCode: 200, httpVersion: nil, headerFields: headers)!
        urlSchemeTask.didReceive(response)

        tracker.start(urlSchemeTask)

        Task { @MainActor in
            let reply = self.getScenarioResponse(message: req.message, proficiency: proficiency)

            if self.tracker.isActive(urlSchemeTask) {
                let chunk = self.sseChunk(["content": reply])
                urlSchemeTask.didReceive(chunk)
                let finalChunk = self.sseChunk(["done": true])
                urlSchemeTask.didReceive(finalChunk)
                urlSchemeTask.didFinish()
                self.tracker.stop(urlSchemeTask)
            }
        }
    }

    private func getScenarioResponse(message: String, proficiency: String) -> String {
        guard
            let webAssetsURL = Bundle.main.url(forResource: "WebAssets", withExtension: nil),
            let data = try? Data(contentsOf: webAssetsURL.appendingPathComponent("static/chat-scenarios.json")),
            let scenariosDict = try? JSONSerialization.jsonObject(with: data) as? [String: [[String: Any]]],
            let levelScenarios = scenariosDict[proficiency] ?? scenariosDict["B1"],
            !levelScenarios.isEmpty
        else {
            return "¡Hola! Bienvenido al modo de práctica estático (\(proficiency)). ¿Sobre qué tema te gustaría conversar hoy?"
        }

        let userText = message.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        let chosenScenario = levelScenarios.randomElement()!
        let responses = (chosenScenario["responses"] as? [[String: Any]]) ?? []

        for item in responses {
            if let pattern = item["user_pattern"] as? String,
               let reply = item["reply"] as? String {
                if let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
                   regex.firstMatch(in: userText, options: [], range: NSRange(location: 0, length: userText.utf16.count)) != nil {
                    let correction = item["correction"] as? String
                    if let corr = correction, !corr.isEmpty {
                        return "\(reply)\n\n(\(corr))"
                    }
                    return reply
                }
            }
        }

        let initial = (chosenScenario["initial_message"] as? String) ?? "¡Hola! ¿Cómo estás hoy?"
        return "¡Gracias por tu mensaje! \(initial)"
    }

    // MARK: - Sentence Builder Handlers

    private func serveSentenceGenerate(urlSchemeTask: WKURLSchemeTask, requestData: Data) {
        let req = try? JSONDecoder().decode(SentenceGenerateRequest.self, from: requestData)
        let proficiency = req?.proficiency ?? "B1"

        tracker.start(urlSchemeTask)

        guard
            let webAssetsURL = Bundle.main.url(forResource: "WebAssets", withExtension: nil),
            let data = try? Data(contentsOf: webAssetsURL.appendingPathComponent("static/sentence-builder.json")),
            let items = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
            !items.isEmpty
        else {
            serveStaticFallbackSentence(urlSchemeTask: urlSchemeTask)
            return
        }

        let filtered = items.filter { ($0["proficiency"] as? String) == proficiency }
        let selected = (filtered.isEmpty ? items : filtered).randomElement()!

        let testSentence = (selected["test_sentence"] as? String) ?? ""
        let englishTranslation = (selected["english_translation"] as? String) ?? ""
        let distractors = (selected["distractors"] as? [String]) ?? []

        let sentenceWords = testSentence.components(separatedBy: .whitespaces).filter { !$0.isEmpty }
        var allWords = sentenceWords + distractors
        allWords.shuffle()

        let body: [String: Any] = [
            "english_translation": englishTranslation,
            "test_sentence": testSentence,
            "words": allWords
        ]

        serveJSON(urlSchemeTask: urlSchemeTask, url: urlSchemeTask.request.url!, body: body)
        tracker.stop(urlSchemeTask)
    }

    private func serveSentenceEvaluate(urlSchemeTask: WKURLSchemeTask, requestData: Data) {
        guard let jsonRequest = try? JSONSerialization.jsonObject(with: requestData) as? [String: Any] else {
            serveStaticFallbackEvaluate(urlSchemeTask: urlSchemeTask, userSentence: "")
            return
        }

        let userSentence = ((jsonRequest["user_sentence"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)

        tracker.start(urlSchemeTask)

        let isNotEmpty = !userSentence.isEmpty
        let body: [String: Any] = [
            "correct": isNotEmpty,
            "feedback": isNotEmpty ? "¡Muy bien! Tu oración fue registrada correctamente." : "Ingresa o construye una oración en español.",
            "correction": ""
        ]

        serveJSON(urlSchemeTask: urlSchemeTask, url: urlSchemeTask.request.url!, body: body)
        tracker.stop(urlSchemeTask)
    }

    private func serveModels(urlSchemeTask: WKURLSchemeTask, url: URL) {
        let body: [String: Any] = ["models": ["offline-static"]]
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
        let fallback: [String: Any] = [
            "english_translation": "She speaks Spanish very well.",
            "test_sentence": "Ella habla español muy bien.",
            "words": ["Ella", "habla", "español", "muy", "bien.", "come", "corre", "tarde"]
        ]
        serveJSON(urlSchemeTask: urlSchemeTask, url: urlSchemeTask.request.url!, body: fallback)
        tracker.stop(urlSchemeTask)
    }

    private func serveStaticFallbackEvaluate(urlSchemeTask: WKURLSchemeTask, userSentence: String) {
        let isCorrect = !userSentence.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let body: [String: Any] = [
            "correct": isCorrect,
            "feedback": isCorrect ? "¡Bien hecho! Tu respuesta es válida." : "Intenta de nuevo.",
            "correction": ""
        ]
        serveJSON(urlSchemeTask: urlSchemeTask, url: urlSchemeTask.request.url!, body: body)
        tracker.stop(urlSchemeTask)
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

private struct SentenceGenerateRequest: Decodable {
    let topic: String?
    let proficiency: String?
    let model: String?
}
